import { getD1 } from "@/db";
import { config } from "./config";
import { requiredString, isEmail, ValidationError } from "./validation";
import { legalNotice } from "./legal-notifications";

export const dmcaReady=()=>Boolean(config.dmcaRegistered&&Date.parse(config.dmcaRegistrationExpiresAt)>Date.now()&&config.dmcaAgentName&&config.dmcaAgentEmail&&config.dmcaAgentAddress&&config.dmcaAgentPhone);
export async function submitMarketplaceReport(input:Record<string,unknown>) {
  const kind=requiredString(input.kind,'report type',40);
  if(!['suspicious','copyright','counter_notice','other'].includes(kind))throw new ValidationError('Choose a report type.');
  const email=requiredString(input.email,'email',254).toLowerCase(),name=requiredString(input.name,'name',200);
  if(!isEmail(email))throw new ValidationError('Enter a valid reply email.');
  const subjectUrl=requiredString(input.subjectUrl,'listing or content URL',2000),details=requiredString(input.details,'report details',12000);
  let url:URL;try{url=new URL(subjectUrl);}catch{throw new ValidationError('Enter the full URL of the content.');}
  if(!['https:','http:'].includes(url.protocol))throw new ValidationError('Enter an HTTP or HTTPS content URL.');
  const signature=requiredString(input.signature,'electronic signature',200);
  if(input.truthful!==true)throw new ValidationError('Confirm that your report is accurate.');
  let relatedId:string|null=null;
  if(['copyright','counter_notice'].includes(kind)) {
    if(input.authorized!==true)throw new ValidationError('Accept the copyright declaration.');
    for(const key of ['mailingAddress','phone','workOrRemovedContent'])requiredString(input[key],key,2000);
    if(kind==='counter_notice') {
      if(input.jurisdiction!==true)throw new ValidationError('Accept the jurisdiction and service-of-process declaration.');
      relatedId=requiredString(input.relatedId,'original report reference',100);
      if(!await getD1().prepare("SELECT 1 FROM marketplace_reports WHERE id=? AND kind='copyright' AND status='removed'").bind(relatedId).first())throw new ValidationError('Use the original removal report reference. Contact support if you do not have it.');
    }
  }
  const id=crypto.randomUUID(),now=new Date();
  const record=JSON.stringify({description:details,mailingAddress:input.mailingAddress??null,phone:input.phone??null,workOrRemovedContent:input.workOrRemovedContent??null,truthful:true,authorized:input.authorized===true,jurisdiction:input.jurisdiction===true});
  await getD1().batch([
    getD1().prepare("INSERT INTO marketplace_reports(id,kind,email,name,subject_url,details,signature,related_id,due_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,kind,email,name,subjectUrl,record,signature,relatedId,new Date(now.getTime()+86400000).toISOString()),
    legalNotice(`report:${id}`,config.supportEmail,`Marketplace report: ${kind}`,`Report ${id} needs review at ${config.siteUrl}/admin/compliance. Reports and copyright notices require prompt human review.`),
  ]);
  return {id};
}
