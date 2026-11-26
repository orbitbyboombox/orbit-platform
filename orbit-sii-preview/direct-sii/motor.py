"""Núcleo de certificación. Firma con llaves provistas por el operador."""
from base64 import b64decode, b64encode
from datetime import date
from hashlib import sha1
from pathlib import Path
from lxml import etree as E
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

SII = "http://www.sii.cl/SiiDte"
DS = "http://www.w3.org/2000/09/xmldsig#"
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"

def parse(raw, encoding=None):
    if len(raw) > 4_000_000 or b"\0" in raw:
        raise ValueError("Tamaño o codificación XML inválidos")
    root = E.fromstring(raw, E.XMLParser(encoding=encoding, resolve_entities=False, no_network=True, load_dtd=False))
    if root.getroottree().docinfo.doctype:
        raise ValueError("DTD no permitida")
    return root

def wire(root, encoding="ISO-8859-1", declaration=False):
    return E.tostring(root, encoding=encoding, xml_declaration=declaration, with_tail=False)

def canon(root):
    return E.tostring(root, method="c14n", with_comments=False)

def put(root, name, value=None, ns=SII, **attrs):
    node = E.SubElement(root, E.QName(ns, name) if ns else name, **attrs)
    if value is not None:
        node.text = str(value)
    return node

def nodes(root, values, ns=SII):
    for name, value in values:
        put(root, name, value, ns)

def sign(key, data):
    return b64encode(key.sign(data, padding.PKCS1v15(), hashes.SHA1())).decode()

def verify(key, signature, data):
    key.verify(b64decode(signature), data, padding.PKCS1v15(), hashes.SHA1())

def integer(value):
    return int.from_bytes(b64decode(value), "big")

def b64int(value):
    return b64encode(value.to_bytes((value.bit_length()+7)//8,"big")).decode()

def validate(raw, schema):
    parser = E.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
    E.XMLSchema(E.parse(str(Path(schema).resolve(strict=True)), parser)).assertValid(parse(raw))

def timber(d, caf_xml, caf_key, anchor, total, stamp):
    caf = parse(caf_xml,"ISO-8859-1")
    if caf.tag != "CAF" or caf.get("version") != "1.0" or [n.tag for n in caf] != ["DA","FRMA"]:
        raise ValueError("CAF inválido")
    da, frma = caf
    if frma.get("algoritmo") != "SHA1withRSA":
        raise ValueError("Algoritmo CAF inesperado")
    verify(anchor, frma.text, wire(da))
    issuer, receiver = d["issuer"], d["receiver"]
    if (da.findtext("RE"),da.findtext("TD")) != (issuer["rut"],str(d["kind"])) or not int(da.findtext("RNG/D")) <= d["folio"] <= int(da.findtext("RNG/H")) or d["date"] < da.findtext("FA"):
        raise ValueError("CAF fuera de emisor, tipo, fecha o folio")
    numbers = rsa.RSAPublicNumbers(integer(da.findtext("RSAPK/E")), integer(da.findtext("RSAPK/M")))
    if numbers != caf_key.public_key().public_numbers():
        raise ValueError("La llave TED no corresponde al CAF")
    dd = E.Element("DD")
    nodes(dd,(("RE",issuer["rut"]),("TD",d["kind"]),("F",d["folio"]),("FE",d["date"]),("RR",receiver["rut"]),("RSR",receiver["name"][:40]),("MNT",total),("IT1",d["lines"][0]["name"][:40])),None)
    dd.append(caf)
    put(dd,"TSTED",stamp,None)
    payload = wire(dd).replace(wire(caf),caf_xml,1)
    signature = sign(caf_key,payload)
    verify(numbers.public_key(),signature,payload)
    return b'<TED version="1.0">'+payload+b'<FRMT algoritmo="SHA1withRSA">'+signature.encode()+b'</FRMT></TED>'

def signature(root, target, key, cert, *, enveloped=False):
    if key.public_key().public_numbers() != cert.public_key().public_numbers():
        raise ValueError("El certificado y la llave no coinciden")
    digest = b64encode(sha1(canon(target)).digest()).decode()
    sig = E.SubElement(root,E.QName(DS,"Signature"),nsmap={None:DS})
    info = put(sig,"SignedInfo",ns=DS)
    put(info,"CanonicalizationMethod",ns=DS,Algorithm=C14N)
    put(info,"SignatureMethod",ns=DS,Algorithm=DS+"rsa-sha1")
    ref = put(info,"Reference",ns=DS,URI="" if enveloped else "#"+target.get("ID"))
    transforms = put(ref,"Transforms",ns=DS)
    if enveloped:
        put(transforms,"Transform",ns=DS,Algorithm=DS+"enveloped-signature")
    put(transforms,"Transform",ns=DS,Algorithm=C14N)
    put(ref,"DigestMethod",ns=DS,Algorithm=DS+"sha1")
    put(ref,"DigestValue",digest,DS)
    put(sig,"SignatureValue",sign(key,canon(info)),DS)
    info_key = put(sig,"KeyInfo",ns=DS)
    public = put(put(info_key,"KeyValue",ns=DS),"RSAKeyValue",ns=DS)
    numbers = cert.public_key().public_numbers()
    nodes(public,(("Modulus",b64int(numbers.n)),("Exponent",b64int(numbers.e))),DS)
    put(put(info_key,"X509Data",ns=DS),"X509Certificate",b64encode(cert.public_bytes(serialization.Encoding.DER)).decode(),DS)

def sign_seed(seed,key,cert):
    if not seed.isascii() or not seed.isdigit() or len(seed)>64:
        raise ValueError("Semilla inválida")
    root = E.Element("getToken")
    put(put(root,"item",ns=None),"Semilla",seed,None)
    signature(root,root,key,cert,enveloped=True)
    return wire(root,"UTF-8",True)

def verify_generated(raw,cert):
    root = parse(raw)
    targets = root.xpath("//*[@ID]")
    ids = {node.get("ID"):node for node in targets}
    signatures = root.findall(f".//{{{DS}}}Signature")
    if len(ids)!=2 or len(targets)!=2 or len(signatures)!=2:
        raise ValueError("Sobre o firmas incompletos")
    expected_ids = set(ids)
    for sig in signatures:
        info = sig.find(f"{{{DS}}}SignedInfo")
        ref = info.find(f"{{{DS}}}Reference")
        target_id = ref.get("URI","")[1:]
        if ref.get("URI") != "#"+target_id or target_id not in expected_ids:
            raise ValueError("Referencia XML inválida")
        expected_ids.remove(target_id)
        embedded = x509.load_der_x509_certificate(b64decode(sig.findtext(f".//{{{DS}}}X509Certificate")))
        if embedded.fingerprint(hashes.SHA256())!=cert.fingerprint(hashes.SHA256()):
            raise ValueError("Certificado inesperado")
        if b64decode(ref.findtext(f"{{{DS}}}DigestValue")) != sha1(canon(ids[target_id])).digest():
            raise ValueError("Digest XML no coincide")
        verify(cert.public_key(),sig.findtext(f"{{{DS}}}SignatureValue"),canon(info))

def build(d,*,caf_xml,caf_key,anchor,key,cert,stamp):
    kind,folio,day = d["kind"],d["folio"],d["date"]
    issuer,receiver,lines = d["issuer"],d["receiver"],d["lines"]
    date.fromisoformat(day)
    if kind not in {33,39,61} or type(folio) is not int or folio<1 or day>stamp[:10] or not lines or not all(type(x["amount"]) is int and x["amount"]>0 for x in lines):
        raise ValueError("Datos del DTE inválidos")
    gross = sum(row["amount"] for row in lines)
    discount = d.get("discount",0)
    if type(discount) is not int or not 0<=discount<gross:
        raise ValueError("Descuento inválido")
    net = gross-discount
    iva = (net*19+50)//100
    total = net+iva
    ref = d.get("reference")
    if kind==61 and (not ref or ref["kind"] not in {33,39} or ref["total"]!=total or not 0<ref["folio"] or ref["date"]>day):
        raise ValueError("El tipo 61 requiere anulación total referenciada")
    if kind!=61 and ref:
        raise ValueError("Referencia fuera del alcance inicial")
    root_name = "EnvioBOLETA" if kind==39 else "EnvioDTE"
    xsi = "http://www.w3.org/2001/XMLSchema-instance"
    root = E.Element(E.QName(SII,root_name),nsmap={None:SII,"xsi":xsi},version="1.0")
    root.set(E.QName(xsi,"schemaLocation"),f"{SII} {root_name}_{'v11' if kind==39 else 'v10'}.xsd")
    batch = put(root,"SetDTE",ID=f"ENV-{kind}-{folio}")
    cover = put(batch,"Caratula",version="1.0")
    nodes(cover,(("RutEmisor",issuer["rut"]),("RutEnvia",d["sender"]),("RutReceptor","60803000-K"),("FchResol",d["resolution_date"]),("NroResol",d["resolution_number"]),("TmstFirmaEnv",stamp)))
    nodes(put(cover,"SubTotDTE"),(("TpoDTE",kind),("NroDTE",1)))
    dte = put(batch,"DTE",version="1.0")
    doc = put(dte,"Documento",ID=f"DTE-{kind}-{folio}")
    head = put(doc,"Encabezado")
    identity = put(head,"IdDoc")
    nodes(identity,(("TipoDTE",kind),("Folio",folio),("FchEmis",day)))
    if kind==39:
        nodes(identity,(("IndServicio",3),("IndMntNeto",2)))
    if kind==33:
        put(identity,"FmaPago",d.get("payment_form",1))
    em = put(head,"Emisor")
    put(em,"RUTEmisor",issuer["rut"])
    if kind==39:
        nodes(em,(("RznSocEmisor",issuer["name"]),("GiroEmisor",issuer["activity"])))
    else:
        nodes(em,(("RznSoc",issuer["name"]),("GiroEmis",issuer["activity"]),("Acteco",issuer["activity_code"])))
    nodes(em,(("DirOrigen",issuer["address"]),("CmnaOrigen",issuer["city"])))
    re = put(head,"Receptor")
    nodes(re,(("RUTRecep",receiver["rut"]),("RznSocRecep",receiver["name"])))
    if kind!=39:
        nodes(re,(("GiroRecep",receiver["activity"]),("DirRecep",receiver["address"]),("CmnaRecep",receiver["city"])))
    amounts = put(head,"Totales")
    put(amounts,"MntNeto",net)
    if kind!=39:
        put(amounts,"TasaIVA",19)
    nodes(amounts,(("IVA",iva),("MntTotal",total)))
    for i,row in enumerate(lines,1):
        nodes(put(doc,"Detalle"),(("NroLinDet",i),("NmbItem",row["name"]),("QtyItem",1),("PrcItem",row["amount"]),("MontoItem",row["amount"])))
    if discount:
        nodes(put(doc,"DscRcgGlobal"),(("NroLinDR",1),("TpoMov","D"),("TpoValor","$"),("ValorDR",discount)))
    if ref:
        nodes(put(doc,"Referencia"),(("NroLinRef",1),("TpoDocRef",ref["kind"]),("FolioRef",ref["folio"]),("FchRef",ref["date"]),("CodRef",1),("RazonRef",ref["reason"])))
    ted = timber(d,caf_xml,caf_key,anchor,total,stamp)
    doc.append(parse(b'<holder xmlns="'+SII.encode()+b'">'+ted+b'</holder>',"ISO-8859-1")[0])
    put(doc,"TmstFirma",stamp)
    signature(dte,doc,key,cert)
    signature(root,batch,key,cert)
    xml = wire(root,declaration=True)
    verify_generated(xml,cert)
    if ted not in xml:
        raise ValueError("Cambió la serialización del TED")
    return xml,ted,{"net":net,"iva":iva,"total":total}
