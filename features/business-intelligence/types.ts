export interface BusinessIntelligenceDataset{
  generatedAt:string;
  financialEvents:readonly {project_id:string;customer_id:string;status:string;event_date:string|null;revenue:number;real_cost:number;gross_profit:number;gross_margin:number;outstanding_balance:number}[];
  customers:readonly {id:string;full_name:string;city:string|null;metadata:Record<string,unknown>;created_at:string}[];
  projects:readonly {id:string;customer_id:string;name:string;project_type:string;status:string;event_date:string|null;city:string|null;location:string|null;created_at:string}[];
  services:readonly {project_id:string;service_code:string;duration_hours:number|null}[];
  quotations:readonly {id:string;project_id:string;customer_id:string;status:string;official_price:number;final_customer_price:number|null;grand_total:number;discount_total:number;pricing_snapshot:Record<string,unknown>|null;approved_by:string|null;created_by:string|null;created_at:string;approved_at:string|null}[];
  quotationItems:readonly {quotation_id:string;item_type:string;code:string;label:string;total:number}[];
  profits:readonly {id:string;project_id:string;revenue:number;operational_cost:number;gross_margin:number;gross_margin_percent:number;created_at:string;status?:string}[];
  assignments:readonly {id:string;project_id:string;staff_id:string;assignment_type:string;status:string;created_at:string}[];
  payroll:readonly {project_id:string;staff_id:string;total_internal_payment:number;status:string}[];
  staff:readonly {id:string;first_name:string;last_name:string;status:string}[];
  assets:readonly {id:string;asset_code:string;asset_type:string;status:string;usage_counter:number}[];
  assetAssignments:readonly {asset_id:string;project_id:string;assignment_status:string}[];
  assetHistory:readonly {asset_id:string;project_id:string|null;history_type:string;occurred_at:string}[];
  reviews:readonly {id:string;project_id:string;customer_id:string;venue_name:string;venue_city:string|null;general_rating:number;customer_experience:string;operational_experience:string;lessons_avoid:string;recommendations:string;created_at:string}[];
  reviewStaff:readonly {review_id:string;staff_id:string;assignment_type:string}[];
  profiles:readonly {id:string;display_name:string}[];
  receivables:readonly {id:string;project_id:string;customer_id:string;amount:number;outstanding_balance:number;effective_status:string;days_remaining:number|null;aging_bucket:string}[];
}
export type IntelligenceRange="TODAY"|"WEEK"|"MONTH"|"QUARTER"|"YEAR"|"CUSTOM";
export interface ChartDatum{label:string;value:number;secondary?:string}
