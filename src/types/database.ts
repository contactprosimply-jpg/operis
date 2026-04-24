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
  created_at: string
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
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  user_id: string
  name: string
  email: string
  phone: string | null
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

export interface Quote {
  id: string
  tender_id: string
  supplier_id: string
  price_ht: number | null
  document_url: string | null
  notes: string | null
  received_at: string
  created_at: string
}

export interface Email {
  id: string
  user_id: string
  message_id: string | null
  subject: string | null
  from_address: string | null
  to_address: string | null
  body_text: string | null
  body_html: string | null
  received_at: string | null
  is_read: boolean
  is_ao: boolean
  ao_score: number
  tender_id: string | null
  created_at: string
}

export interface EmailLog {
  id: string
  tender_id: string | null
  supplier_id: string | null
  type: 'consultation' | 'relance' | 'relance_2'
  to_address: string
  subject: string | null
  body: string | null
  sent_at: string
  success: boolean
  error_message: string | null
}

export interface TenderStats {
  tender_id: string
  title: string
  client: string
  status: TenderStatus
  deadline: string | null
  nb_suppliers: number
  nb_responses: number
  nb_relaunched: number
  nb_quotes: number
  min_quote: number | null
  max_quote: number | null
  days_remaining: number | null
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
}

export interface UpdateTenderPayload {
  title?: string
  client?: string
  description?: string
  deadline?: string
  status?: TenderStatus
}

export interface CreateSupplierPayload {
  name: string
  email: string
  phone?: string
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