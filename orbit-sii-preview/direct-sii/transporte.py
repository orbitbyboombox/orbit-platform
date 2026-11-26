"""Transporte de certificación. Ninguna conexión sale por defecto."""
from html import escape
from datetime import date
import json
import re
import secrets
from urllib.request import Request, build_opener, HTTPRedirectHandler
from motor import parse

DTE = "https://maullin.sii.cl"
BOLETA = "https://apicert.sii.cl"
UPLOAD = "https://pangal.sii.cl"
PATH = "/recursos/v1/boleta.electronica."
PRODUCTION = ("https://palena.sii.cl","https://api.sii.cl","https://rahue.sii.cl")

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None

def https(method,url,headers,body=None):
    with build_opener(NoRedirect()).open(Request(url,data=body,headers=headers,method=method),timeout=18) as response:
        raw=response.read(4_000_001)
        if len(raw)>4_000_000: raise ValueError("Respuesta demasiado grande")
        return raw

def value(root,name):
    matches=root.xpath("//*[local-name()=$name]",name=name)
    if not matches or not matches[0].text: raise ValueError(f"Respuesta sin {name}")
    return matches[0].text.strip()

def rut(value):
    if not re.fullmatch(r"[0-9]{1,8}-[0-9K]",value): raise ValueError("RUT inválido")
    return value.split("-")

def cookie(token):
    if not re.fullmatch(r"[A-Za-z0-9._=-]{1,128}",token): raise ValueError("Token inválido")
    return {"Cookie":"TOKEN="+token,"Accept":"application/json, text/xml"}

def track_id(track):
    if not re.fullmatch(r"[0-9]{1,20}",track): raise ValueError("Track ID no verificable")
    return track

def multipart(xml,sender,issuer):
    n,d=rut(sender); i,v=rut(issuer)
    keys=("rutSender","dvSender","rutCompany","dvCompany")
    boundary="orbit-"+secrets.token_hex(20)
    parts=[f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{x}\r\n'.encode() for k,x in zip(keys,(n,d,i,v))]
    parts.extend((f'--{boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="envio.xml"\r\nContent-Type: text/xml\r\n\r\n'.encode(),xml,f'\r\n--{boundary}--\r\n'.encode()))
    return b"".join(parts),f"multipart/form-data; boundary={boundary}"

class SiiDirect:
    def __init__(self,environment="certification",*,allow_certification_network=False,request=None):
        if environment!="certification": raise ValueError("Producción deshabilitada")
        self.request=request or (https if allow_certification_network else self.offline)

    @staticmethod
    def offline(*args,**kwargs):
        raise RuntimeError("Red SII de certificación desactivada")

    def soap(self,service,operation,args):
        fields="".join(f'<{k} xsi:type="xsd:string">{escape(str(v))}</{k}>' for k,v in args)
        body=(f'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
              f'xmlns:xsd="http://www.w3.org/2001/XMLSchema"><s:Body s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><m:{operation} xmlns:m="http://DefaultNamespace">'
              f'{fields}</m:{operation}></s:Body></s:Envelope>').encode()
        result=parse(self.request("POST",DTE+f"/DTEWS/{service}.jws",{"Content-Type":"text/xml; charset=utf-8","SOAPAction":'""'},body))
        return parse(value(result,operation+"Return").encode())

    def authenticate(self,kind,signer):
        if kind==39:
            seed=parse(self.request("GET",BOLETA+PATH+"semilla",{"Accept":"application/xml"}))
        else:
            seed=self.soap("CrSeed","getSeed",[])
        if value(seed,"ESTADO")!="00": raise ValueError("Semilla rechazada")
        signed=signer(value(seed,"SEMILLA"))
        if kind==39:
            reply=parse(self.request("POST",BOLETA+PATH+"token",{"Content-Type":"application/xml","Accept":"application/xml"},signed))
        else:
            reply=self.soap("GetTokenFromSeed","getToken",[("pszXml",signed.decode())])
        if value(reply,"ESTADO")!="00": raise ValueError("Autenticación rechazada")
        token=value(reply,"TOKEN")
        cookie(token)
        return token

    def submit(self,kind,xml,sender,issuer,token):
        body,mime=multipart(xml,sender,issuer)
        url=UPLOAD+PATH+"envio" if kind==39 else DTE+"/cgi_dte/UPL/DTEUpload"
        response=self.request("POST",url,{**cookie(token),"Content-Type":mime,"Referer":DTE+"/"},body)
        if kind==39:
            result=json.loads(response)
            return {"track":track_id(str(result.get("trackid",""))),"code":str(result.get("estado",""))}
        xml=parse(response)
        if value(xml,"STATUS")!="0": raise ValueError("Envío no confirmado por el SII")
        return {"track":track_id(value(xml,"TRACKID")),"code":"0"}

    def status(self,kind,issuer,track,token):
        track_id(track); n,d=rut(issuer); headers=cookie(token)
        if kind==39:
            response=json.loads(self.request("GET",BOLETA+PATH+f"envio/{issuer}-{track}",headers))
            return {"track":track,"code":response.get("estado"),"raw":response}
        response=self.soap("QueryEstUp","getEstUp",zip(("RutCompania","DvCompania","TrackId","Token"),(n,d,track,token)))
        return {"track":track,"code":value(response,"ESTADO"),"raw":response}

    def document_status(self,kind,sender,issuer,recipient,folio,day,total,token):
        if kind not in (33,61): raise ValueError("Usar consulta REST para boletas")
        cookie(token)
        values=[*rut(sender),*rut(issuer),*rut(recipient),kind,folio,date.fromisoformat(day).strftime("%d%m%Y"),total,token]
        fields=("RutConsultante","DvConsultante","RutCompania","DvCompania","RutReceptor","DvReceptor","TipoDte","FolioDte","FechaEmisionDte","MontoDte","Token")
        return self.soap("QueryEstDte","getEstDte",zip(fields,values))
