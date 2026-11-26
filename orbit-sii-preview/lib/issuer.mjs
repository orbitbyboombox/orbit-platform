const fallback = {legalName:"BOOMBOX · EMISOR DE PRUEBA",rut:"SIN RUT FISCAL",address:"",city:"",website:"",email:"",activity:"",office:""};
export function sampleIssuer(value) {
  if (!value) return fallback;
  const data = typeof value === "string" ? JSON.parse(value) : value;
  return Object.fromEntries(Object.entries(fallback).map(([key, defaultValue])=>[key,String(data[key]??defaultValue).trim()]));
}
