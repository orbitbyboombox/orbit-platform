export interface CompanySettings {
  id:string; companyName:string; legalName:string; brandName:string; productName:string; productVersion:string;
  developedBy:string; poweredBy:string; taxId:string; taxName:string; taxRate:number; supportEmail:string; salesEmail:string;
  operationsEmail:string; phone:string; website:string; address:string; city:string; country:string; locale:string; currency:string;
  timezone:string; googleWorkspaceDomain:string; logoUrl:string; isotypeUrl:string; documentLogoUrl:string; portalLogoUrl:string;
  dashboardLogoUrl:string; emailLogoUrl:string; primaryColor:string; accentColor:string; loginTagline:string; portalKicker:string;
  portalWelcome:string; emailSignature:string; contractFooter:string; quotationFooter:string; driveRootFolder:string;
  contractConfiguration:Record<string,unknown>; pdfConfiguration:Record<string,unknown>; emailConfiguration:Record<string,unknown>;
  portalConfiguration:Record<string,unknown>; dashboardConfiguration:Record<string,unknown>; version:number;
}

export const DEFAULT_COMPANY_SETTINGS:CompanySettings={
  id:"default",companyName:"Company",legalName:"Company",brandName:"Company",productName:"ORBIT",productVersion:"v1.9",developedBy:"Company",poweredBy:"Platform Core",taxId:"",taxName:"Tax",taxRate:0,supportEmail:"",salesEmail:"",operationsEmail:"",phone:"",website:"",address:"",city:"",country:"",locale:"es-CL",currency:"CLP",timezone:"UTC",googleWorkspaceDomain:"",logoUrl:"/branding/boombox-official-logo.png",isotypeUrl:"/branding/orbit-isotype.png",documentLogoUrl:"/branding/boombox-official-logo.png",portalLogoUrl:"/branding/boombox-official-logo.png",dashboardLogoUrl:"/branding/boombox-official-logo.png",emailLogoUrl:"/branding/boombox-official-logo.png",primaryColor:"#F28E2B",accentColor:"#F28E2B",loginTagline:"Plataforma operativa",portalKicker:"Tu experiencia",portalWelcome:"Todo lo importante de tu evento, en un solo lugar.",emailSignature:"Equipo",contractFooter:"Documento emitido desde ORBIT.",quotationFooter:"Cotización emitida desde ORBIT.",driveRootFolder:"ORBIT",contractConfiguration:{agreementVersion:"1.0",signatureValidityDays:7},pdfConfiguration:{pageSize:"A4",showProductSignature:true},emailConfiguration:{senderName:"Equipo",replyTo:""},portalConfiguration:{showCountdown:true,allowExtraRequests:true,allowDesignUploads:true},dashboardConfiguration:{showWorkspaceHealth:true,showFinancialSummary:true},version:1,
};
