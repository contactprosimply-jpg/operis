export type TenderStatus =
  | 'nouveau'
  | 'en_cours'
  | 'urgence'
  | 'gagne'
  | 'perdu'
  | 'cloture'

export type ConsultationStatus =
  | 'en_attente'
  | 'envoye'
  | 'relance'
  | 'relance_2'
  | 'repondu'
  | 'refuse'

export interface Profile {
  id: string
  full_name: string | null
  company: string | null
  role: string
  onboarding_done?: boolean
  tour_done?: boolean
  mail_welcome_seen?: boolean
  terms_accepted_at?: string | null
  terms_version?: string | null
  created_at: string
}

export interface Contact {
  id: string
  user_id: string
  email: string
  name: string | null
  company: string | null
  is_favorite: boolean
  ao_ids: string[]
  email_count: number
  last_contacted_at: string | null
  created_at: string
}

export interface UserSettings {
  user_id: string
  relance_first_delay_days: number
  relance_interval_days: number
  relance_max_count: number
  relance_working_days_only: boolean
  relance_confirm_before_send: boolean
  auto_labels_enabled: boolean
  label_a_traiter_delay_hours: number
  label_en_retard_delay_days: number
  mail_signature: string
  mail_signature_enabled: boolean
  ao_detection_threshold: number
  mail_module_enabled: boolean
  updated_at?: string
}

export interface Tender {
  id: string
  user_id: string
  title: string
  client: string
  description: string | null
  deadline: string | null
  status: TenderStatus
  source_email_id: string | null
  assigned_to?: string | null
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  user_id: string
  name: string
  email: string
  additional_emails: string[]
  phone: string | null
  specialty: string | null
  country: string | null
  language: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ConsultationSupplier {
  id: string
  tender_id: string
  supplier_id: string
  status: ConsultationStatus
  last_sent_at: string | null
  relaunch_count: number
  created_at: string
  updated_at: string
}

export interface EmailAttachment {
  filename: string
  contentType: string
  size: number
  path?: string
  data?: string
  hasData?: boolean
  quotaExceeded?: boolean
  contentDisposition?: string
  contentId?: string
}

export interface Quote {
  id: string
  tender_id: string
  supplier_id: string
  price_ht: number | null
  document_url: string | null
  notes: string | null
  source_email_id?: string | null
  is_selected?: boolean
  received_at: string
  created_at: string
}

export type EmailPriority = 'urgent' | 'normal' | 'info'

export interface EmailLabel {
  id: string
  name: string
  color: string
  /** manual = ajout utilisateur, auto = règle Operis */
  source?: 'manual' | 'auto'
  autoReason?: string
}

export interface Email {
  id: string
  user_id: string
  message_id: string | null
  subject: string | null
  from_address: string | null
  to_address: string | null
  cc_address?: string | null
  bcc_address?: string | null
  body_text: string | null
  body_html: string | null
  received_at: string | null
  is_read: boolean
  is_ao: boolean
  ao_score: number
  is_ao_related?: boolean
  ao_detection_score?: number
  ao_detection_category?: string | null
  ao_detection_keywords?: string[]
  thread_id?: string | null
  in_reply_to?: string | null
  references_ids?: string[]
  tender_id: string | null
  attachments?: EmailAttachment[]
  has_attachments?: boolean
  attachments_pending?: boolean
  source_member_id?: string | null
  source_member_name?: string | null
  priority?: EmailPriority
  labels?: EmailLabel[]
  mail_folder?: string | null
  imap_uid?: number | null
  imap_mailbox?: string | null
  is_starred?: boolean
  deleted_at?: string | null
  original_folder?: string | null
  created_at: string
}

export interface MailDraft {
  id: string
  user_id: string
  to_address: string
  cc: string
  bcc: string
  subject: string
  body: string
  attachments?: EmailAttachment[]
  created_at: string
  updated_at: string
}

export interface EmailLog {
  id: string
  user_id?: string | null
  tender_id: string | null
  supplier_id: string | null
  type: 'consultation' | 'relance' | 'relance_2' | 'consultation_manual' | 'relance_manual'
  to_address: string
  subject: string | null
  body: string | null
  sent_at: string
  success: boolean
  error_message: string | null
  attachments?: EmailAttachment[]
}

export interface TenderStats {
  tender_id: string
  user_id?: string
  title: string
  client: string
  status: TenderStatus
  deadline: string | null
  assigned_to?: string | null
  nb_suppliers: number
  nb_responses: number
  nb_relaunched: number
  nb_quotes: number
  min_quote: number | null
  max_quote: number | null
  days_remaining: number | null
  budget_ht?: number | null
  priorite?: string | null
  creator_label?: string | null
  assignee_label?: string | null
}

export interface ConsultationWithSupplier extends ConsultationSupplier {
  supplier: Supplier
}

export interface QuoteWithSupplier extends Quote {
  supplier: Supplier
}

export interface TenderDetail extends Tender {
  consultations: ConsultationWithSupplier[]
  quotes: QuoteWithSupplier[]
  stats: TenderStats
}

export interface CreateTenderPayload {
  title: string
  client: string
  description?: string
  deadline?: string
  source_email_id?: string
  is_own_client?: boolean
}

export interface UpdateTenderPayload {
  title?: string
  client?: string
  description?: string
  deadline?: string
  status?: TenderStatus
  is_own_client?: boolean
}

export interface CreateSupplierPayload {
  name: string
  email: string
  additional_emails?: string[]
  phone?: string
  specialty?: string
  country?: string
  language?: string
  notes?: string
}

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      tenders: {
        Row: Tender
        Insert: Omit<Tender, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Tender, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      suppliers: {
        Row: Supplier
        Insert: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Supplier, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      consultation_suppliers: {
        Row: ConsultationSupplier
        Insert: Omit<ConsultationSupplier, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ConsultationSupplier, 'id' | 'created_at' | 'updated_at'>>
      }
      quotes: {
        Row: Quote
        Insert: Omit<Quote, 'id' | 'created_at'>
        Update: Partial<Omit<Quote, 'id' | 'created_at'>>
      }
      emails: {
        Row: Email
        Insert: Omit<Email, 'id' | 'created_at'>
        Update: Partial<Omit<Email, 'id' | 'user_id' | 'created_at'>>
      }
      email_logs: {
        Row: EmailLog
        Insert: Omit<EmailLog, 'id'>
        Update: never
      }
    }
    Views: {
      tender_stats: {
        Row: TenderStats
      }
    }
    Enums: {
      tender_status: TenderStatus
      consultation_status: ConsultationStatus
    }
  }
}