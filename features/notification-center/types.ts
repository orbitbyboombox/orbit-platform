export type NotificationCategory="COMMERCIAL"|"CUSTOMER"|"OPERATIONS"|"STAFF"|"EQUIPMENT"|"GOOGLE"|"SYSTEM"|"SECURITY"|"PAYMENTS"|"PORTAL";
export type NotificationPriority="CRITICAL"|"HIGH"|"NORMAL"|"INFORMATION";
export interface OperationalNotification{id:string;category:NotificationCategory;priority:NotificationPriority;type:string;title:string;message:string;createdAt:string;actionRequired:boolean;read:boolean;archived:boolean;relatedHref?:string;project?:string;customer?:string;staff?:string}
export interface NotificationInbox{notifications:readonly OperationalNotification[];unreadCount:number;retentionDays:number}
