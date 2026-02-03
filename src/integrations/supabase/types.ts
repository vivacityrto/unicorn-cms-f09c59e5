export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      accountability_chart_versions: {
        Row: {
          change_summary: string
          chart_id: string
          created_at: string
          created_by: string
          id: string
          snapshot: Json
          tenant_id: number
          version_number: number
        }
        Insert: {
          change_summary: string
          chart_id: string
          created_at?: string
          created_by: string
          id?: string
          snapshot?: Json
          tenant_id: number
          version_number?: number
        }
        Update: {
          change_summary?: string
          chart_id?: string
          created_at?: string
          created_by?: string
          id?: string
          snapshot?: Json
          tenant_id?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "accountability_chart_versions_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "accountability_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_chart_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_charts: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id?: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_charts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_functions: {
        Row: {
          chart_id: string
          created_at: string
          description: string | null
          function_type: Database["public"]["Enums"]["eos_function_type"] | null
          id: string
          name: string
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          chart_id: string
          created_at?: string
          description?: string | null
          function_type?:
            | Database["public"]["Enums"]["eos_function_type"]
            | null
          id?: string
          name: string
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          chart_id?: string
          created_at?: string
          description?: string | null
          function_type?:
            | Database["public"]["Enums"]["eos_function_type"]
            | null
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_functions_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "accountability_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_functions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_seat_assignments: {
        Row: {
          assignment_type: string
          created_at: string
          end_date: string | null
          id: string
          seat_id: string
          start_date: string
          tenant_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_type: string
          created_at?: string
          end_date?: string | null
          id?: string
          seat_id: string
          start_date?: string
          tenant_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          end_date?: string | null
          id?: string
          seat_id?: string
          start_date?: string
          tenant_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_seat_assignments_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_seat_assignments_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "accountability_seat_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_seat_roles: {
        Row: {
          created_at: string
          id: string
          role_text: string
          seat_id: string
          sort_order: number
          tenant_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          role_text: string
          seat_id: string
          sort_order?: number
          tenant_id: number
        }
        Update: {
          created_at?: string
          id?: string
          role_text?: string
          seat_id?: string
          sort_order?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "accountability_seat_roles_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_seat_roles_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "accountability_seat_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accountability_seats: {
        Row: {
          chart_id: string
          created_at: string
          description: string | null
          eos_role_type:
            | Database["public"]["Enums"]["eos_seat_role_type"]
            | null
          function_id: string
          gwc_capacity: string | null
          gwc_get_it: string | null
          gwc_want_it: string | null
          id: string
          seat_name: string
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          chart_id: string
          created_at?: string
          description?: string | null
          eos_role_type?:
            | Database["public"]["Enums"]["eos_seat_role_type"]
            | null
          function_id: string
          gwc_capacity?: string | null
          gwc_get_it?: string | null
          gwc_want_it?: string | null
          id?: string
          seat_name: string
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          chart_id?: string
          created_at?: string
          description?: string | null
          eos_role_type?:
            | Database["public"]["Enums"]["eos_seat_role_type"]
            | null
          function_id?: string
          gwc_capacity?: string | null
          gwc_get_it?: string | null
          gwc_want_it?: string | null
          id?: string
          seat_name?: string
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountability_seats_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "accountability_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_seats_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "accountability_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountability_seats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      active_timers: {
        Row: {
          client_id: number
          created_at: string
          id: string
          notes: string | null
          package_id: number | null
          stage_id: number | null
          start_at: string
          task_id: string | null
          tenant_id: number
          updated_at: string
          user_id: string
          work_type: string
        }
        Insert: {
          client_id: number
          created_at?: string
          id?: string
          notes?: string | null
          package_id?: number | null
          stage_id?: number | null
          start_at?: string
          task_id?: string | null
          tenant_id: number
          updated_at?: string
          user_id: string
          work_type?: string
        }
        Update: {
          client_id?: number
          created_at?: string
          id?: string
          notes?: string | null
          package_id?: number | null
          stage_id?: number | null
          start_at?: string
          task_id?: string | null
          tenant_id?: number
          updated_at?: string
          user_id?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_timers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          acted_entity_id: string | null
          created_at: string
          created_by: string | null
          id: string
          inputs_fingerprint: string | null
          meeting_id: string | null
          payload: Json
          scope: string
          status: string
          suggestion_type: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          acted_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inputs_fingerprint?: string | null
          meeting_id?: string | null
          payload?: Json
          scope: string
          status?: string
          suggestion_type: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          acted_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inputs_fingerprint?: string | null
          meeting_id?: string | null
          payload?: Json
          scope?: string
          status?: string
          suggestion_type?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "ai_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          clickup_enabled: boolean
          email_sending_enabled: boolean | null
          generation_enabled: boolean | null
          generation_rate_limit_per_hour: number | null
          id: number
          max_generation_retries: number | null
          review_required_before_release: boolean
          updated_at: string
        }
        Insert: {
          clickup_enabled?: boolean
          email_sending_enabled?: boolean | null
          generation_enabled?: boolean | null
          generation_rate_limit_per_hour?: number | null
          id?: never
          max_generation_retries?: number | null
          review_required_before_release?: boolean
          updated_at?: string
        }
        Update: {
          clickup_enabled?: boolean
          email_sending_enabled?: boolean | null
          generation_enabled?: boolean | null
          generation_rate_limit_per_hour?: number | null
          id?: never
          max_generation_retries?: number | null
          review_required_before_release?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      audit: {
        Row: {
          action_title: string | null
          audit_title: string
          client_id: string
          completed_at: string | null
          conducted_by: string | null
          created_at: string
          created_by: string
          doc_number: string | null
          id: number
          started_at: string | null
          status: string
          template_id: number | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          action_title?: string | null
          audit_title?: string
          client_id: string
          completed_at?: string | null
          conducted_by?: string | null
          created_at?: string
          created_by: string
          doc_number?: string | null
          id?: number
          started_at?: string | null
          status?: string
          template_id?: number | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          action_title?: string | null
          audit_title?: string
          client_id?: string
          completed_at?: string | null
          conducted_by?: string | null
          created_at?: string
          created_by?: string
          doc_number?: string | null
          id?: number
          started_at?: string | null
          status?: string
          template_id?: number | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_action: {
        Row: {
          assigned_to: string
          audit_id: number
          created_at: string
          created_by: string
          description: string
          due_date: string
          finding_id: number | null
          id: number
          status: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to: string
          audit_id: number
          created_at?: string
          created_by: string
          description: string
          due_date: string
          finding_id?: number | null
          id?: number
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          audit_id?: number
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string
          finding_id?: number | null
          id?: number
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_action_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_action_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "audit_finding"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_avatars: {
        Row: {
          created_at: string | null
          file_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_path?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_eos_events: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
          meeting_id: string | null
          reason: string | null
          tenant_id: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          meeting_id?: string | null
          reason?: string | null
          tenant_id: number
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          meeting_id?: string | null
          reason?: string | null
          tenant_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_eos_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "audit_eos_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_eos_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_eos_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_finding: {
        Row: {
          audit_id: number
          auto_generated: boolean
          created_at: string
          created_by: string
          id: number
          impact: string
          priority: string
          question_id: number | null
          summary: string
          updated_at: string
        }
        Insert: {
          audit_id: number
          auto_generated?: boolean
          created_at?: string
          created_by: string
          id?: number
          impact: string
          priority: string
          question_id?: number | null
          summary: string
          updated_at?: string
        }
        Update: {
          audit_id?: number
          auto_generated?: boolean
          created_at?: string
          created_by?: string
          id?: number
          impact?: string
          priority?: string
          question_id?: number | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_finding_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_finding_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "audit_question"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_inspection: {
        Row: {
          client_id: string | null
          completed_at: string | null
          compliance_score: number | null
          conducted_by: string
          created_at: string
          doc_number: string | null
          document_id: number | null
          id: number
          inspection_title: string
          responses: Json | null
          selected_tenant_id: number | null
          started_at: string | null
          status: string
          template_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          compliance_score?: number | null
          conducted_by: string
          created_at?: string
          doc_number?: string | null
          document_id?: number | null
          id?: number
          inspection_title: string
          responses?: Json | null
          selected_tenant_id?: number | null
          started_at?: string | null
          status?: string
          template_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          compliance_score?: number | null
          conducted_by?: string
          created_at?: string
          doc_number?: string | null
          document_id?: number | null
          id?: number
          inspection_title?: string
          responses?: Json | null
          selected_tenant_id?: number | null
          started_at?: string | null
          status?: string
          template_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_inspection_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inspection_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inspection_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "audit_inspection_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inspection_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_invites: {
        Row: {
          actor_user_id: string | null
          code: string | null
          created_at: string
          detail: string | null
          email: string
          function_version: string | null
          id: string
          invite_attempts: number | null
          outcome: string
          role: string
          tenant_id: number
        }
        Insert: {
          actor_user_id?: string | null
          code?: string | null
          created_at?: string
          detail?: string | null
          email: string
          function_version?: string | null
          id?: string
          invite_attempts?: number | null
          outcome: string
          role: string
          tenant_id: number
        }
        Update: {
          actor_user_id?: string | null
          code?: string | null
          created_at?: string
          detail?: string | null
          email?: string
          function_version?: string | null
          id?: string
          invite_attempts?: number | null
          outcome?: string
          role?: string
          tenant_id?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          created_at: string | null
          editor_name: string | null
          editor_uuid: string | null
          field_name: string
          id: number
          new_value: string | null
          old_value: string | null
          timestamp: string | null
          user_uuid: string | null
        }
        Insert: {
          created_at?: string | null
          editor_name?: string | null
          editor_uuid?: string | null
          field_name: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          timestamp?: string | null
          user_uuid?: string | null
        }
        Update: {
          created_at?: string | null
          editor_name?: string | null
          editor_uuid?: string | null
          field_name?: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          timestamp?: string | null
          user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_editor_uuid_fkey"
            columns: ["editor_uuid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "audit_log_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      audit_people_analyzer: {
        Row: {
          created_at: string
          details: Json | null
          entry_id: string | null
          event_type: string
          id: string
          tenant_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entry_id?: string | null
          event_type: string
          id?: string
          tenant_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          entry_id?: string | null
          event_type?: string
          id?: string
          tenant_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_people_analyzer_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "people_analyzer_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_people_analyzer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_question: {
        Row: {
          audit_section_id: number
          bank_id: number
          created_at: string
          evidence_prompt: string
          id: number
          order_index: number
          question_text: string
          rating_scale: Json
        }
        Insert: {
          audit_section_id: number
          bank_id: number
          created_at?: string
          evidence_prompt: string
          id?: number
          order_index: number
          question_text: string
          rating_scale: Json
        }
        Update: {
          audit_section_id?: number
          bank_id?: number
          created_at?: string
          evidence_prompt?: string
          id?: number
          order_index?: number
          question_text?: string
          rating_scale?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_question_audit_section_id_fkey"
            columns: ["audit_section_id"]
            isOneToOne: false
            referencedRelation: "audit_section"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_question_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "audit_question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_question_bank: {
        Row: {
          active: boolean
          created_at: string
          evidence_prompt: string
          id: number
          performance_indicator: string
          quality_area: string
          question_text: string
          rating_scale: Json
          risk_tags: string[]
          standard_code: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          evidence_prompt: string
          id?: number
          performance_indicator: string
          quality_area: string
          question_text: string
          rating_scale?: Json
          risk_tags?: string[]
          standard_code: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          evidence_prompt?: string
          id?: number
          performance_indicator?: string
          quality_area?: string
          question_text?: string
          rating_scale?: Json
          risk_tags?: string[]
          standard_code?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      audit_response: {
        Row: {
          audit_question_id: number
          created_at: string
          created_by: string
          evidence_files: string[] | null
          id: number
          notes: string | null
          rating: string
          risk_level: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          audit_question_id: number
          created_at?: string
          created_by: string
          evidence_files?: string[] | null
          id?: number
          notes?: string | null
          rating: string
          risk_level?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          audit_question_id?: number
          created_at?: string
          created_by?: string
          evidence_files?: string[] | null
          id?: number
          notes?: string | null
          rating?: string
          risk_level?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_response_audit_question_id_fkey"
            columns: ["audit_question_id"]
            isOneToOne: true
            referencedRelation: "audit_question"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_restricted_actions: {
        Row: {
          action_attempted: string
          created_at: string | null
          id: string
          page_path: string | null
          permission_required: string | null
          tenant_id: number | null
          user_id: string
          user_role: string | null
        }
        Insert: {
          action_attempted: string
          created_at?: string | null
          id?: string
          page_path?: string | null
          permission_required?: string | null
          tenant_id?: number | null
          user_id: string
          user_role?: string | null
        }
        Update: {
          action_attempted?: string
          created_at?: string | null
          id?: string
          page_path?: string | null
          permission_required?: string | null
          tenant_id?: number | null
          user_id?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_restricted_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_seat_health: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          reason: string | null
          recommendation_id: string | null
          seat_id: string | null
          tenant_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          reason?: string | null
          recommendation_id?: string | null
          seat_id?: string | null
          tenant_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          reason?: string | null
          recommendation_id?: string | null
          seat_id?: string | null
          tenant_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_seat_health_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "seat_rebalancing_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_seat_health_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_seat_health_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "audit_seat_health_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_section: {
        Row: {
          audit_id: number
          created_at: string
          id: number
          order_index: number
          standard_code: string
          title: string
        }
        Insert: {
          audit_id: number
          created_at?: string
          id?: number
          order_index: number
          standard_code: string
          title: string
        }
        Update: {
          audit_id?: number
          created_at?: string
          id?: number
          order_index?: number
          standard_code?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_section_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_template_questions: {
        Row: {
          category: string
          created_at: string
          id: number
          label: string
          notes: string | null
          options: Json | null
          order_index: number
          question_type: string
          required: boolean
          template_id: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: number
          label: string
          notes?: string | null
          options?: Json | null
          order_index?: number
          question_type: string
          required?: boolean
          template_id: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: number
          label?: string
          notes?: string | null
          options?: Json | null
          order_index?: number
          question_type?: string
          required?: boolean
          template_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_template_response_sets: {
        Row: {
          created_at: string
          created_by: string
          id: number
          is_global: boolean
          name: string
          options: Json
          template_id: number | null
          tenant_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: number
          is_global?: boolean
          name: string
          options?: Json
          template_id?: number | null
          tenant_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: number
          is_global?: boolean
          name?: string
          options?: Json
          template_id?: number | null
          tenant_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_template_response_sets_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_templates: {
        Row: {
          access: string
          created_at: string
          created_by: string
          description: string | null
          id: number
          last_published: string | null
          name: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          access?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: number
          last_published?: string | null
          name?: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          access?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: number
          last_published?: string | null
          name?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      auth_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_issued: string | null
          ip_used: string | null
          meta: Json | null
          token_hash: string
          token_type: string
          ua_issued: string | null
          ua_used: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_issued?: string | null
          ip_used?: string | null
          meta?: Json | null
          token_hash: string
          token_type: string
          ua_issued?: string | null
          ua_used?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_issued?: string | null
          ip_used?: string | null
          meta?: Json | null
          token_hash?: string
          token_type?: string
          ua_issued?: string | null
          ua_used?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backup_notes: {
        Row: {
          assignees: string[] | null
          completed_date: string | null
          created_at: string | null
          created_by: string | null
          date_imported: string | null
          duration: number | null
          file_names: string[] | null
          id: string | null
          is_pinned: boolean | null
          note_details: string | null
          note_type: string | null
          package_id: number | null
          parent_id: number | null
          parent_type: string | null
          parent_uuid: string | null
          priority: string | null
          started_date: string | null
          tags: string[] | null
          tenant_id: number | null
          tenant_uuid: string | null
          title: string | null
          u1_id: number | null
          u1_package: string | null
          u1_package_id: number | null
          u1_staffname: string | null
          u1_userid: number | null
          updated_at: string | null
          uploaded_files: string[] | null
          user_id: number | null
          user_uuid: string | null
        }
        Insert: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          date_imported?: string | null
          duration?: number | null
          file_names?: string[] | null
          id?: string | null
          is_pinned?: boolean | null
          note_details?: string | null
          note_type?: string | null
          package_id?: number | null
          parent_id?: number | null
          parent_type?: string | null
          parent_uuid?: string | null
          priority?: string | null
          started_date?: string | null
          tags?: string[] | null
          tenant_id?: number | null
          tenant_uuid?: string | null
          title?: string | null
          u1_id?: number | null
          u1_package?: string | null
          u1_package_id?: number | null
          u1_staffname?: string | null
          u1_userid?: number | null
          updated_at?: string | null
          uploaded_files?: string[] | null
          user_id?: number | null
          user_uuid?: string | null
        }
        Update: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          date_imported?: string | null
          duration?: number | null
          file_names?: string[] | null
          id?: string | null
          is_pinned?: boolean | null
          note_details?: string | null
          note_type?: string | null
          package_id?: number | null
          parent_id?: number | null
          parent_type?: string | null
          parent_uuid?: string | null
          priority?: string | null
          started_date?: string | null
          tags?: string[] | null
          tenant_id?: number | null
          tenant_uuid?: string | null
          title?: string | null
          u1_id?: number | null
          u1_package?: string | null
          u1_package_id?: number | null
          u1_staffname?: string | null
          u1_userid?: number | null
          updated_at?: string | null
          uploaded_files?: string[] | null
          user_id?: number | null
          user_uuid?: string | null
        }
        Relationships: []
      }
      backup_package_instances: {
        Row: {
          client_id: number | null
          clo_id: number | null
          end_date: string | null
          hours_added: number | null
          hours_included: number | null
          hours_used: number | null
          id: number | null
          is_complete: boolean | null
          last_document_update_email: string | null
          manager_id: string | null
          package_id: number | null
          release_documents_office: boolean | null
          release_documents_pdf: boolean | null
          start_date: string | null
          tenant_id: number | null
          u1_packageid: number | null
        }
        Insert: {
          client_id?: number | null
          clo_id?: number | null
          end_date?: string | null
          hours_added?: number | null
          hours_included?: number | null
          hours_used?: number | null
          id?: number | null
          is_complete?: boolean | null
          last_document_update_email?: string | null
          manager_id?: string | null
          package_id?: number | null
          release_documents_office?: boolean | null
          release_documents_pdf?: boolean | null
          start_date?: string | null
          tenant_id?: number | null
          u1_packageid?: number | null
        }
        Update: {
          client_id?: number | null
          clo_id?: number | null
          end_date?: string | null
          hours_added?: number | null
          hours_included?: number | null
          hours_used?: number | null
          id?: number | null
          is_complete?: boolean | null
          last_document_update_email?: string | null
          manager_id?: string | null
          package_id?: number | null
          release_documents_office?: boolean | null
          release_documents_pdf?: boolean | null
          start_date?: string | null
          tenant_id?: number | null
          u1_packageid?: number | null
        }
        Relationships: []
      }
      backup_packages: {
        Row: {
          created_at: string | null
          details: string | null
          document_assurance_period: number | null
          duration_months: number | null
          full_text: string | null
          id: number | null
          name: string | null
          package_type: string | null
          progress_mode: string | null
          slug: string | null
          status: string | null
          total_hours: number | null
          u1_packageid: number | null
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          document_assurance_period?: number | null
          duration_months?: number | null
          full_text?: string | null
          id?: number | null
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string | null
          total_hours?: number | null
          u1_packageid?: number | null
        }
        Update: {
          created_at?: string | null
          details?: string | null
          document_assurance_period?: number | null
          duration_months?: number | null
          full_text?: string | null
          id?: number | null
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string | null
          total_hours?: number | null
          u1_packageid?: number | null
        }
        Relationships: []
      }
      backup_packages_phase3: {
        Row: {
          created_at: string | null
          details: string | null
          document_assurance_period: number | null
          duration_months: number | null
          full_text: string | null
          id: number | null
          name: string | null
          package_type: string | null
          progress_mode: string | null
          slug: string | null
          status: string | null
          total_hours: number | null
          u1_packageid: number | null
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          document_assurance_period?: number | null
          duration_months?: number | null
          full_text?: string | null
          id?: number | null
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string | null
          total_hours?: number | null
          u1_packageid?: number | null
        }
        Update: {
          created_at?: string | null
          details?: string | null
          document_assurance_period?: number | null
          duration_months?: number | null
          full_text?: string | null
          id?: number | null
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string | null
          total_hours?: number | null
          u1_packageid?: number | null
        }
        Relationships: []
      }
      backup_tenant_addresses: {
        Row: {
          address_type: string | null
          address1: string | null
          address2: string | null
          address3: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          full_address: string | null
          geohash: string | null
          id: string | null
          inactive: boolean | null
          latitude: number | null
          legacy_userid: number | null
          longitude: number | null
          notes: string | null
          postcode: string | null
          state: string | null
          suburb: string | null
          tenant_id: number | null
          tenant_uuid: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address_type?: string | null
          address1?: string | null
          address2?: string | null
          address3?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          full_address?: string | null
          geohash?: string | null
          id?: string | null
          inactive?: boolean | null
          latitude?: number | null
          legacy_userid?: number | null
          longitude?: number | null
          notes?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number | null
          tenant_uuid?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address_type?: string | null
          address1?: string | null
          address2?: string | null
          address3?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          full_address?: string | null
          geohash?: string | null
          id?: string | null
          inactive?: boolean | null
          latitude?: number | null
          legacy_userid?: number | null
          longitude?: number | null
          notes?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number | null
          tenant_uuid?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      backup_tenants: {
        Row: {
          abn: string | null
          accounting_system: string | null
          acn: string | null
          created_at: string | null
          cricos_id: string | null
          id: number | null
          id_uuid: string | null
          legacy_id: number | null
          legal_name: string | null
          lms: string | null
          metadata: Json | null
          name: string | null
          package_added_at: string | null
          package_id: number | null
          package_ids: number[] | null
          risk_level: string | null
          rto_id: string | null
          rto_name: string | null
          slug: string | null
          sms: string | null
          stage_ids: number[] | null
          state: string | null
          status: string | null
          tga_connected_at: string | null
          tga_last_synced_at: string | null
          tga_legal_name: string | null
          tga_snapshot: Json | null
          tga_status: string | null
          tga_sync_status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          abn?: string | null
          accounting_system?: string | null
          acn?: string | null
          created_at?: string | null
          cricos_id?: string | null
          id?: number | null
          id_uuid?: string | null
          legacy_id?: number | null
          legal_name?: string | null
          lms?: string | null
          metadata?: Json | null
          name?: string | null
          package_added_at?: string | null
          package_id?: number | null
          package_ids?: number[] | null
          risk_level?: string | null
          rto_id?: string | null
          rto_name?: string | null
          slug?: string | null
          sms?: string | null
          stage_ids?: number[] | null
          state?: string | null
          status?: string | null
          tga_connected_at?: string | null
          tga_last_synced_at?: string | null
          tga_legal_name?: string | null
          tga_snapshot?: Json | null
          tga_status?: string | null
          tga_sync_status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          abn?: string | null
          accounting_system?: string | null
          acn?: string | null
          created_at?: string | null
          cricos_id?: string | null
          id?: number | null
          id_uuid?: string | null
          legacy_id?: number | null
          legal_name?: string | null
          lms?: string | null
          metadata?: Json | null
          name?: string | null
          package_added_at?: string | null
          package_id?: number | null
          package_ids?: number[] | null
          risk_level?: string | null
          rto_id?: string | null
          rto_name?: string | null
          slug?: string | null
          sms?: string | null
          stage_ids?: number[] | null
          state?: string | null
          status?: string | null
          tga_connected_at?: string | null
          tga_last_synced_at?: string | null
          tga_legal_name?: string | null
          tga_snapshot?: Json | null
          tga_status?: string | null
          tga_sync_status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      backup_users: {
        Row: {
          abn: string | null
          accountable_person: string | null
          accounting_system: string | null
          acn: string | null
          archived: boolean | null
          availability_note: string | null
          avatar_path: string | null
          avatar_updated_at: string | null
          avatar_url: string | null
          away_message: string | null
          bio: string | null
          biography: string | null
          booking_url: string | null
          clickup_url: string | null
          client_id: string | null
          communication_pref: string | null
          country: string | null
          cover_user_id: string | null
          created_at: string | null
          cricos_id: string | null
          csc_visibility: Json | null
          disabled: boolean | null
          email: string | null
          email_address: string | null
          first_name: string | null
          global_role: string | null
          head_office_address: string | null
          is_csc: boolean | null
          is_team: boolean | null
          job_title: string | null
          keap_url: string | null
          last_name: string | null
          last_new_client_tasks_email: string | null
          last_sign_in_at: string | null
          leave_from: string | null
          leave_until: string | null
          legacy_id: number | null
          legal_name: string | null
          linkedin: string | null
          linkedin_url: string | null
          lms: string | null
          manager_id: number | null
          manager_uuid: string | null
          mobile_phone: string | null
          notes: string | null
          phone: string | null
          phone_number: string | null
          po_box: string | null
          po_box_address: string | null
          postcode: string | null
          profile_photo: boolean | null
          public_holiday_region: string | null
          registration_end_date: string | null
          response_time_sla: string | null
          role: string | null
          rto_id: number | null
          rto_name: string | null
          staff_team: Database["public"]["Enums"]["staff_team_type"] | null
          state: number | null
          street_address: string | null
          street_number_and_name: string | null
          suburb: string | null
          superadmin_level: string | null
          tenant_id: number | null
          tenant_name: string | null
          tenant_role: string | null
          timezone: string | null
          title: string | null
          training_facility_address: string | null
          TS: string | null
          unicorn_role: Database["public"]["Enums"]["unicorn_role"] | null
          updated_at: string | null
          user_type: Database["public"]["Enums"]["user_type_enum"] | null
          user_uuid: string | null
          website: string | null
          working_days: Json | null
          working_hours: Json | null
        }
        Insert: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          archived?: boolean | null
          availability_note?: string | null
          avatar_path?: string | null
          avatar_updated_at?: string | null
          avatar_url?: string | null
          away_message?: string | null
          bio?: string | null
          biography?: string | null
          booking_url?: string | null
          clickup_url?: string | null
          client_id?: string | null
          communication_pref?: string | null
          country?: string | null
          cover_user_id?: string | null
          created_at?: string | null
          cricos_id?: string | null
          csc_visibility?: Json | null
          disabled?: boolean | null
          email?: string | null
          email_address?: string | null
          first_name?: string | null
          global_role?: string | null
          head_office_address?: string | null
          is_csc?: boolean | null
          is_team?: boolean | null
          job_title?: string | null
          keap_url?: string | null
          last_name?: string | null
          last_new_client_tasks_email?: string | null
          last_sign_in_at?: string | null
          leave_from?: string | null
          leave_until?: string | null
          legacy_id?: number | null
          legal_name?: string | null
          linkedin?: string | null
          linkedin_url?: string | null
          lms?: string | null
          manager_id?: number | null
          manager_uuid?: string | null
          mobile_phone?: string | null
          notes?: string | null
          phone?: string | null
          phone_number?: string | null
          po_box?: string | null
          po_box_address?: string | null
          postcode?: string | null
          profile_photo?: boolean | null
          public_holiday_region?: string | null
          registration_end_date?: string | null
          response_time_sla?: string | null
          role?: string | null
          rto_id?: number | null
          rto_name?: string | null
          staff_team?: Database["public"]["Enums"]["staff_team_type"] | null
          state?: number | null
          street_address?: string | null
          street_number_and_name?: string | null
          suburb?: string | null
          superadmin_level?: string | null
          tenant_id?: number | null
          tenant_name?: string | null
          tenant_role?: string | null
          timezone?: string | null
          title?: string | null
          training_facility_address?: string | null
          TS?: string | null
          unicorn_role?: Database["public"]["Enums"]["unicorn_role"] | null
          updated_at?: string | null
          user_type?: Database["public"]["Enums"]["user_type_enum"] | null
          user_uuid?: string | null
          website?: string | null
          working_days?: Json | null
          working_hours?: Json | null
        }
        Update: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          archived?: boolean | null
          availability_note?: string | null
          avatar_path?: string | null
          avatar_updated_at?: string | null
          avatar_url?: string | null
          away_message?: string | null
          bio?: string | null
          biography?: string | null
          booking_url?: string | null
          clickup_url?: string | null
          client_id?: string | null
          communication_pref?: string | null
          country?: string | null
          cover_user_id?: string | null
          created_at?: string | null
          cricos_id?: string | null
          csc_visibility?: Json | null
          disabled?: boolean | null
          email?: string | null
          email_address?: string | null
          first_name?: string | null
          global_role?: string | null
          head_office_address?: string | null
          is_csc?: boolean | null
          is_team?: boolean | null
          job_title?: string | null
          keap_url?: string | null
          last_name?: string | null
          last_new_client_tasks_email?: string | null
          last_sign_in_at?: string | null
          leave_from?: string | null
          leave_until?: string | null
          legacy_id?: number | null
          legal_name?: string | null
          linkedin?: string | null
          linkedin_url?: string | null
          lms?: string | null
          manager_id?: number | null
          manager_uuid?: string | null
          mobile_phone?: string | null
          notes?: string | null
          phone?: string | null
          phone_number?: string | null
          po_box?: string | null
          po_box_address?: string | null
          postcode?: string | null
          profile_photo?: boolean | null
          public_holiday_region?: string | null
          registration_end_date?: string | null
          response_time_sla?: string | null
          role?: string | null
          rto_id?: number | null
          rto_name?: string | null
          staff_team?: Database["public"]["Enums"]["staff_team_type"] | null
          state?: number | null
          street_address?: string | null
          street_number_and_name?: string | null
          suburb?: string | null
          superadmin_level?: string | null
          tenant_id?: number | null
          tenant_name?: string | null
          tenant_role?: string | null
          timezone?: string | null
          title?: string | null
          training_facility_address?: string | null
          TS?: string | null
          unicorn_role?: Database["public"]["Enums"]["unicorn_role"] | null
          updated_at?: string | null
          user_type?: Database["public"]["Enums"]["user_type_enum"] | null
          user_uuid?: string | null
          website?: string | null
          working_days?: Json | null
          working_hours?: Json | null
        }
        Relationships: []
      }
      calendar_entries: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          email_recipients: string[] | null
          entry_date: string
          entry_time: string | null
          id: string
          tenant_id: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          email_recipients?: string[] | null
          entry_date: string
          entry_time?: string | null
          id?: string
          tenant_id?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          email_recipients?: string[] | null
          entry_date?: string
          entry_time?: string | null
          id?: string
          tenant_id?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: Json
          calendar_id: string
          created_at: string
          description: string | null
          end_at: string
          id: string
          last_synced_at: string
          location: string | null
          meeting_url: string | null
          organizer_email: string | null
          processed_at: string | null
          processed_users: Json
          provider: string
          provider_event_id: string
          raw: Json
          start_at: string
          status: string
          tenant_id: number
          title: string
          user_id: string
        }
        Insert: {
          attendees?: Json
          calendar_id: string
          created_at?: string
          description?: string | null
          end_at: string
          id?: string
          last_synced_at?: string
          location?: string | null
          meeting_url?: string | null
          organizer_email?: string | null
          processed_at?: string | null
          processed_users?: Json
          provider?: string
          provider_event_id: string
          raw?: Json
          start_at: string
          status?: string
          tenant_id: number
          title: string
          user_id: string
        }
        Update: {
          attendees?: Json
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_at?: string
          id?: string
          last_synced_at?: string
          location?: string | null
          meeting_url?: string | null
          organizer_email?: string | null
          processed_at?: string | null
          processed_users?: Json
          provider?: string
          provider_event_id?: string
          raw?: Json
          start_at?: string
          status?: string
          tenant_id?: number
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_time_drafts: {
        Row: {
          calendar_event_id: string
          client_id: number | null
          confidence: number
          created_at: string
          created_by: string
          id: string
          is_billable: boolean
          last_viewed_at: string | null
          match_confidence: number | null
          match_reason: string | null
          minutes: number
          notes: string | null
          package_id: number | null
          posted_time_entry_id: string | null
          snoozed_until: string | null
          stage_id: number | null
          status: string
          suggested_client_id: number | null
          suggested_package_id: number | null
          suggestion: Json
          tenant_id: number
          updated_at: string
          work_date: string
          work_type: string | null
        }
        Insert: {
          calendar_event_id: string
          client_id?: number | null
          confidence?: number
          created_at?: string
          created_by: string
          id?: string
          is_billable?: boolean
          last_viewed_at?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          minutes: number
          notes?: string | null
          package_id?: number | null
          posted_time_entry_id?: string | null
          snoozed_until?: string | null
          stage_id?: number | null
          status?: string
          suggested_client_id?: number | null
          suggested_package_id?: number | null
          suggestion?: Json
          tenant_id: number
          updated_at?: string
          work_date: string
          work_type?: string | null
        }
        Update: {
          calendar_event_id?: string
          client_id?: number | null
          confidence?: number
          created_at?: string
          created_by?: string
          id?: string
          is_billable?: boolean
          last_viewed_at?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          minutes?: number
          notes?: string | null
          package_id?: number | null
          posted_time_entry_id?: string | null
          snoozed_until?: string | null
          stage_id?: number | null
          status?: string
          suggested_client_id?: number | null
          suggested_package_id?: number | null
          suggestion?: Json
          tenant_id?: number
          updated_at?: string
          work_date?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_time_drafts_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_time_drafts_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_integration: {
        Row: {
          access_token: string
          bidirectional: boolean
          created_at: string
          id: string
          is_active: boolean
          sync_frequency: string
          updated_at: string
          user_id: string | null
          workspace_id: string
          workspace_name: string
        }
        Insert: {
          access_token: string
          bidirectional?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          sync_frequency?: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
          workspace_name: string
        }
        Update: {
          access_token?: string
          bidirectional?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          sync_frequency?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
          workspace_name?: string
        }
        Relationships: []
      }
      clickup_lists: {
        Row: {
          created_at: string
          id: string
          integration_id: string | null
          is_active: boolean
          list_id: string
          list_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          list_id: string
          list_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          list_id?: string
          list_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_lists_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "clickup_integration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clickup_lists_integration"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "clickup_integration"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_sync_logs: {
        Row: {
          details: Json | null
          direction: string
          error_message: string | null
          id: string
          integration_id: string | null
          status: string
          tasks_created: number
          tasks_deleted: number
          tasks_updated: number
          timestamp: string
        }
        Insert: {
          details?: Json | null
          direction: string
          error_message?: string | null
          id?: string
          integration_id?: string | null
          status: string
          tasks_created?: number
          tasks_deleted?: number
          tasks_updated?: number
          timestamp?: string
        }
        Update: {
          details?: Json | null
          direction?: string
          error_message?: string | null
          id?: string
          integration_id?: string | null
          status?: string
          tasks_created?: number
          tasks_deleted?: number
          tasks_updated?: number
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "clickup_integration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clickup_sync_logs_integration"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "clickup_integration"
            referencedColumns: ["id"]
          },
        ]
      }
      clickup_tasks: {
        Row: {
          assigned_comments: Json | null
          assignees: Json | null
          attachments: Json | null
          checklists: Json | null
          comments: Json | null
          date_created: string | null
          date_created_at: string | null
          date_created_text: string | null
          date_imported: string | null
          due_date: string | null
          due_date_at: string | null
          due_date_text: string | null
          folder_name_path: string | null
          id: string
          import_id: number
          inserted_at: string | null
          list_name: string | null
          parent_id: string | null
          priority: string | null
          rolled_up_time: string | null
          rolled_up_time_text: string | null
          space_name: string | null
          start_date: string | null
          start_date_at: string | null
          start_date_text: string | null
          status: string | null
          tags: Json | null
          task_content: string | null
          task_custom_id: string | null
          task_id: string | null
          task_name: string | null
          time_estimated: string | null
          time_estimated_text: string | null
          time_spent: string | null
          time_spent_text: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_comments?: Json | null
          assignees?: Json | null
          attachments?: Json | null
          checklists?: Json | null
          comments?: Json | null
          date_created?: string | null
          date_created_at?: string | null
          date_created_text?: string | null
          date_imported?: string | null
          due_date?: string | null
          due_date_at?: string | null
          due_date_text?: string | null
          folder_name_path?: string | null
          id?: string
          import_id?: number
          inserted_at?: string | null
          list_name?: string | null
          parent_id?: string | null
          priority?: string | null
          rolled_up_time?: string | null
          rolled_up_time_text?: string | null
          space_name?: string | null
          start_date?: string | null
          start_date_at?: string | null
          start_date_text?: string | null
          status?: string | null
          tags?: Json | null
          task_content?: string | null
          task_custom_id?: string | null
          task_id?: string | null
          task_name?: string | null
          time_estimated?: string | null
          time_estimated_text?: string | null
          time_spent?: string | null
          time_spent_text?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_comments?: Json | null
          assignees?: Json | null
          attachments?: Json | null
          checklists?: Json | null
          comments?: Json | null
          date_created?: string | null
          date_created_at?: string | null
          date_created_text?: string | null
          date_imported?: string | null
          due_date?: string | null
          due_date_at?: string | null
          due_date_text?: string | null
          folder_name_path?: string | null
          id?: string
          import_id?: number
          inserted_at?: string | null
          list_name?: string | null
          parent_id?: string | null
          priority?: string | null
          rolled_up_time?: string | null
          rolled_up_time_text?: string | null
          space_name?: string | null
          start_date?: string | null
          start_date_at?: string | null
          start_date_text?: string | null
          status?: string | null
          tags?: Json | null
          task_content?: string | null
          task_custom_id?: string | null
          task_id?: string | null
          task_name?: string | null
          time_estimated?: string | null
          time_estimated_text?: string | null
          time_spent?: string | null
          time_spent_text?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clickup_tasks_260129: {
        Row: {
          assigned_comments: Json | null
          assignees: Json | null
          attachments: Json | null
          checklists: Json | null
          comments: Json | null
          date_created: string | null
          date_created_at: string | null
          date_created_text: string | null
          date_imported: string | null
          due_date: string | null
          due_date_at: string | null
          due_date_text: string | null
          folder_name_path: string | null
          id: string
          inserted_at: string | null
          list_name: string | null
          parent_id: string | null
          priority: string | null
          rolled_up_time: string | null
          rolled_up_time_text: string | null
          space_name: string | null
          start_date: string | null
          start_date_at: string | null
          start_date_text: string | null
          status: string | null
          tags: Json | null
          task_content: string | null
          task_custom_id: string | null
          task_id: string | null
          task_name: string | null
          time_estimated: string | null
          time_estimated_text: string | null
          time_spent: string | null
          time_spent_text: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_comments?: Json | null
          assignees?: Json | null
          attachments?: Json | null
          checklists?: Json | null
          comments?: Json | null
          date_created?: string | null
          date_created_at?: string | null
          date_created_text?: string | null
          date_imported?: string | null
          due_date?: string | null
          due_date_at?: string | null
          due_date_text?: string | null
          folder_name_path?: string | null
          id?: string
          inserted_at?: string | null
          list_name?: string | null
          parent_id?: string | null
          priority?: string | null
          rolled_up_time?: string | null
          rolled_up_time_text?: string | null
          space_name?: string | null
          start_date?: string | null
          start_date_at?: string | null
          start_date_text?: string | null
          status?: string | null
          tags?: Json | null
          task_content?: string | null
          task_custom_id?: string | null
          task_id?: string | null
          task_name?: string | null
          time_estimated?: string | null
          time_estimated_text?: string | null
          time_spent?: string | null
          time_spent_text?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_comments?: Json | null
          assignees?: Json | null
          attachments?: Json | null
          checklists?: Json | null
          comments?: Json | null
          date_created?: string | null
          date_created_at?: string | null
          date_created_text?: string | null
          date_imported?: string | null
          due_date?: string | null
          due_date_at?: string | null
          due_date_text?: string | null
          folder_name_path?: string | null
          id?: string
          inserted_at?: string | null
          list_name?: string | null
          parent_id?: string | null
          priority?: string | null
          rolled_up_time?: string | null
          rolled_up_time_text?: string | null
          space_name?: string | null
          start_date?: string | null
          start_date_at?: string | null
          start_date_text?: string | null
          status?: string | null
          tags?: Json | null
          task_content?: string | null
          task_custom_id?: string | null
          task_id?: string | null
          task_name?: string | null
          time_estimated?: string | null
          time_estimated_text?: string | null
          time_spent?: string | null
          time_spent_text?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      client_action_item_comments: {
        Row: {
          action_item_id: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          tenant_id: number
        }
        Insert: {
          action_item_id: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id: number
        }
        Update: {
          action_item_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_action_item_comments_action_item_id_fkey"
            columns: ["action_item_id"]
            isOneToOne: false
            referencedRelation: "client_action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      client_action_items: {
        Row: {
          assignee_user_id: string | null
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          item_type: string
          owner_user_id: string | null
          package_id: number | null
          priority: string
          recurrence_rule: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          sort_order: number
          source: string
          source_note_id: string | null
          stage_id: number | null
          status: string
          tenant_id: number
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          item_type?: string
          owner_user_id?: string | null
          package_id?: number | null
          priority?: string
          recurrence_rule?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sort_order?: number
          source?: string
          source_note_id?: string | null
          stage_id?: number | null
          status?: string
          tenant_id: number
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          item_type?: string
          owner_user_id?: string | null
          package_id?: number | null
          priority?: string
          recurrence_rule?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sort_order?: number
          source?: string
          source_note_id?: string | null
          stage_id?: number | null
          status?: string
          tenant_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_action_items_source_note_id_fkey"
            columns: ["source_note_id"]
            isOneToOne: false
            referencedRelation: "client_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_client_action_items_stage"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_alerts: {
        Row: {
          alert_type: string
          body: string | null
          client_id: number
          client_package_id: string | null
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          is_dismissed: boolean
          meta: Json
          package_id: number | null
          severity: string
          tenant_id: number
          threshold_percent: number | null
          title: string
        }
        Insert: {
          alert_type: string
          body?: string | null
          client_id: number
          client_package_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_dismissed?: boolean
          meta?: Json
          package_id?: number | null
          severity?: string
          tenant_id: number
          threshold_percent?: number | null
          title: string
        }
        Update: {
          alert_type?: string
          body?: string | null
          client_id?: number
          client_package_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_dismissed?: boolean
          meta?: Json
          package_id?: number | null
          severity?: string
          tenant_id?: number
          threshold_percent?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_alerts_client_package_id_fkey"
            columns: ["client_package_id"]
            isOneToOne: false
            referencedRelation: "client_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          tenant_id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          tenant_id: number
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          tenant_id?: number
        }
        Relationships: []
      }
      client_email_queue: {
        Row: {
          client_package_stage_id: string
          created_at: string | null
          email_template_id: string
          id: string
          recipient_type: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          client_package_stage_id: string
          created_at?: string | null
          email_template_id: string
          id?: string
          recipient_type: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          trigger_type: string
        }
        Update: {
          client_package_stage_id?: string
          created_at?: string | null
          email_template_id?: string
          id?: string
          recipient_type?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_email_queue_client_package_stage_id_fkey"
            columns: ["client_package_stage_id"]
            isOneToOne: false
            referencedRelation: "client_package_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_email_queue_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_liaisons: {
        Row: {
          assigned_at: string | null
          client_id: string | null
          created_by: string | null
          id: string
          vivacity_user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          client_id?: string | null
          created_by?: string | null
          id?: string
          vivacity_user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          client_id?: string | null
          created_by?: string | null
          id?: string
          vivacity_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_liaisons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_liaisons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_liaisons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "client_liaisons_vivacity_user_id_fkey"
            columns: ["vivacity_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      client_notes: {
        Row: {
          client_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          is_pinned: boolean
          note_type: string
          related_entity_id: string | null
          related_entity_type: string | null
          tags: string[]
          tenant_id: number
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_pinned?: boolean
          note_type: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          tags?: string[]
          tenant_id: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_pinned?: boolean
          note_type?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          tags?: string[]
          tenant_id?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_package_stage_state: {
        Row: {
          blocked_at: string | null
          blocked_reason: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: number
          is_required: boolean
          notes: string | null
          package_id: number
          sort_order: number
          stage_id: number
          started_at: string | null
          status: string
          tenant_id: number
          updated_at: string
          updated_by: string | null
          waiting_at: string | null
          waiting_reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: never
          is_required?: boolean
          notes?: string | null
          package_id: number
          sort_order?: number
          stage_id: number
          started_at?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
          waiting_at?: string | null
          waiting_reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: never
          is_required?: boolean
          notes?: string | null
          package_id?: number
          sort_order?: number
          stage_id?: number
          started_at?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
          waiting_at?: string | null
          waiting_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_package_stage_state_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_package_stages: {
        Row: {
          client_package_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          sort_order: number
          stage_id: number
          started_at: string | null
          status: string
        }
        Insert: {
          client_package_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          sort_order: number
          stage_id: number
          started_at?: string | null
          status?: string
        }
        Update: {
          client_package_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          sort_order?: number
          stage_id?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_package_stages_client_package_id_fkey"
            columns: ["client_package_id"]
            isOneToOne: false
            referencedRelation: "client_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_package_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_packages: {
        Row: {
          assigned_csc_user_id: string | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          id: string
          included_minutes: number
          package_id: number
          start_date: string
          status: string
          tenant_id: number
        }
        Insert: {
          assigned_csc_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          included_minutes?: number
          package_id: number
          start_date?: string
          status?: string
          tenant_id: number
        }
        Update: {
          assigned_csc_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          included_minutes?: number
          package_id?: number
          start_date?: string
          status?: string
          tenant_id?: number
        }
        Relationships: []
      }
      client_stage_documents: {
        Row: {
          client_package_stage_id: string
          created_at: string | null
          delivery_type: string
          document_id: number
          id: string
          sort_order: number
          visibility: string
        }
        Insert: {
          client_package_stage_id: string
          created_at?: string | null
          delivery_type: string
          document_id: number
          id?: string
          sort_order: number
          visibility: string
        }
        Update: {
          client_package_stage_id?: string
          created_at?: string | null
          delivery_type?: string
          document_id?: number
          id?: string
          sort_order?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_stage_documents_client_package_stage_id_fkey"
            columns: ["client_package_stage_id"]
            isOneToOne: false
            referencedRelation: "client_package_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_stage_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "client_stage_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_task_instances: {
        Row: {
          clienttask_id: number
          completion_date: string | null
          created_at: string | null
          due_date: string | null
          id: number
          stageinstance_id: number
          status: number
          u1_id: number | null
        }
        Insert: {
          clienttask_id: number
          completion_date?: string | null
          created_at?: string | null
          due_date?: string | null
          id: number
          stageinstance_id: number
          status?: number
          u1_id?: number | null
        }
        Update: {
          clienttask_id?: number
          completion_date?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: number
          stageinstance_id?: number
          status?: number
          u1_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_task_instances_client_task_id_fkey"
            columns: ["clienttask_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_task_instances_stage_instance_id_fkey"
            columns: ["stageinstance_id"]
            isOneToOne: false
            referencedRelation: "stage_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          created_at: string | null
          description: string | null
          due_date_offset: number | null
          id: number
          instructions: string | null
          is_mandatory: boolean | null
          name: string
          sort_order: number
          stage_id: number
          u1_id: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date_offset?: number | null
          id: number
          instructions?: string | null
          is_mandatory?: boolean | null
          name: string
          sort_order?: number
          stage_id: number
          u1_id?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date_offset?: number | null
          id?: number
          instructions?: string | null
          is_mandatory?: boolean | null
          name?: string
          sort_order?: number
          stage_id?: number
          u1_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks_u2: {
        Row: {
          client_package_stage_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          due_date: string | null
          id: string
          instructions: string | null
          name: string
          sort_order: number
          status: string
          template_task_id: string | null
        }
        Insert: {
          client_package_stage_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          name: string
          sort_order: number
          status?: string
          template_task_id?: string | null
        }
        Update: {
          client_package_stage_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          name?: string
          sort_order?: number
          status?: string
          template_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_u2_client_package_stage_id_fkey"
            columns: ["client_package_stage_id"]
            isOneToOne: false
            referencedRelation: "client_package_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_team_tasks: {
        Row: {
          client_package_stage_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          estimated_hours: number | null
          id: string
          instructions: string | null
          is_mandatory: boolean | null
          name: string
          owner_role: string | null
          sort_order: number
          status: string
          template_task_id: string | null
        }
        Insert: {
          client_package_stage_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          estimated_hours?: number | null
          id?: string
          instructions?: string | null
          is_mandatory?: boolean | null
          name: string
          owner_role?: string | null
          sort_order: number
          status?: string
          template_task_id?: string | null
        }
        Update: {
          client_package_stage_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          estimated_hours?: number | null
          id?: string
          instructions?: string | null
          is_mandatory?: boolean | null
          name?: string
          owner_role?: string | null
          sort_order?: number
          status?: string
          template_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_team_tasks_client_package_stage_id_fkey"
            columns: ["client_package_stage_id"]
            isOneToOne: false
            referencedRelation: "client_package_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tga_snapshot: {
        Row: {
          client_id: string
          last_sync_at: string | null
          quals_total: number
          registration_end: string | null
          rto_number: string
          rto_status: string | null
          scope_total: number
          skill_sets_total: number
          source_import_id: string | null
          units_total: number
          updated_at: string
        }
        Insert: {
          client_id: string
          last_sync_at?: string | null
          quals_total?: number
          registration_end?: string | null
          rto_number: string
          rto_status?: string | null
          scope_total?: number
          skill_sets_total?: number
          source_import_id?: string | null
          units_total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          last_sync_at?: string | null
          quals_total?: number
          registration_end?: string | null
          rto_number?: string
          rto_status?: string | null
          scope_total?: number
          skill_sets_total?: number
          source_import_id?: string | null
          units_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tga_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tga_snapshot_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tga_snapshot_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "tga_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_timeline_events: {
        Row: {
          body: string | null
          client_id: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          source: string
          tenant_id: number
          title: string
        }
        Insert: {
          body?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source: string
          tenant_id: number
          title: string
        }
        Update: {
          body?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          tenant_id?: number
          title?: string
        }
        Relationships: []
      }
      clientfields: {
        Row: {
          client_id: number
          field_id: number
          value: string | null
        }
        Insert: {
          client_id: number
          field_id: number
          value?: string | null
        }
        Update: {
          client_id?: number
          field_id?: number
          value?: string | null
        }
        Relationships: []
      }
      clients_legacy: {
        Row: {
          abn: string | null
          accountable_person: string | null
          accounting_system: string | null
          acn: string | null
          address: string | null
          audit_due: string | null
          clickup_url: string | null
          companyname: string
          contactname: string
          country: string | null
          created_at: string | null
          cricos_id: string | null
          document_contact_email: string | null
          document_contact_phone: string | null
          email: string
          first_name: string | null
          framework: string | null
          head_office_address: string | null
          id: string
          keap_url: string | null
          last_name: string | null
          lastcontactdate: string | null
          legal_name: string | null
          logo_url: string | null
          manager: string | null
          package: string | null
          package_type: string | null
          phone: string | null
          po_box_address: string | null
          postcode: string | null
          profilephoto: string | null
          registration_end_date: string | null
          risk_level: string | null
          rto_name: string | null
          rtoid: string | null
          rtolevel: string | null
          state: string | null
          status: string | null
          street_number_name: string | null
          student_management_system: string | null
          suburb: string | null
          tailoring_complete: number | null
          tenant_id: number | null
          timeremaining: number | null
          title: string | null
          trainer_credential_status: string | null
          training_facility_address: string | null
          untailored_documents: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          address?: string | null
          audit_due?: string | null
          clickup_url?: string | null
          companyname: string
          contactname: string
          country?: string | null
          created_at?: string | null
          cricos_id?: string | null
          document_contact_email?: string | null
          document_contact_phone?: string | null
          email: string
          first_name?: string | null
          framework?: string | null
          head_office_address?: string | null
          id?: string
          keap_url?: string | null
          last_name?: string | null
          lastcontactdate?: string | null
          legal_name?: string | null
          logo_url?: string | null
          manager?: string | null
          package?: string | null
          package_type?: string | null
          phone?: string | null
          po_box_address?: string | null
          postcode?: string | null
          profilephoto?: string | null
          registration_end_date?: string | null
          risk_level?: string | null
          rto_name?: string | null
          rtoid?: string | null
          rtolevel?: string | null
          state?: string | null
          status?: string | null
          street_number_name?: string | null
          student_management_system?: string | null
          suburb?: string | null
          tailoring_complete?: number | null
          tenant_id?: number | null
          timeremaining?: number | null
          title?: string | null
          trainer_credential_status?: string | null
          training_facility_address?: string | null
          untailored_documents?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          address?: string | null
          audit_due?: string | null
          clickup_url?: string | null
          companyname?: string
          contactname?: string
          country?: string | null
          created_at?: string | null
          cricos_id?: string | null
          document_contact_email?: string | null
          document_contact_phone?: string | null
          email?: string
          first_name?: string | null
          framework?: string | null
          head_office_address?: string | null
          id?: string
          keap_url?: string | null
          last_name?: string | null
          lastcontactdate?: string | null
          legal_name?: string | null
          logo_url?: string | null
          manager?: string | null
          package?: string | null
          package_type?: string | null
          phone?: string | null
          po_box_address?: string | null
          postcode?: string | null
          profilephoto?: string | null
          registration_end_date?: string | null
          risk_level?: string | null
          rto_name?: string | null
          rtoid?: string | null
          rtolevel?: string | null
          state?: string | null
          status?: string | null
          street_number_name?: string | null
          student_management_system?: string | null
          suburb?: string | null
          tailoring_complete?: number | null
          tenant_id?: number | null
          timeremaining?: number | null
          title?: string | null
          trainer_credential_status?: string | null
          training_facility_address?: string | null
          untailored_documents?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      compliance_pack_exports: {
        Row: {
          completed_at: string | null
          contents_summary: Json | null
          created_at: string
          date_from: string | null
          date_to: string | null
          error: string | null
          export_scope: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          package_id: number | null
          requested_by: string | null
          stage_release_id: string | null
          status: string
          storage_path: string | null
          tenant_id: number
        }
        Insert: {
          completed_at?: string | null
          contents_summary?: Json | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          export_scope?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          package_id?: number | null
          requested_by?: string | null
          stage_release_id?: string | null
          status?: string
          storage_path?: string | null
          tenant_id: number
        }
        Update: {
          completed_at?: string | null
          contents_summary?: Json | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          export_scope?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          package_id?: number | null
          requested_by?: string | null
          stage_release_id?: string | null
          status?: string
          storage_path?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "compliance_pack_exports_stage_release_id_fkey"
            columns: ["stage_release_id"]
            isOneToOne: false
            referencedRelation: "stage_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_tenants: {
        Row: {
          connected_at: string
          email: string
          id: string
          tenant_id: number
          tenant_name: string
          updated_at: string
          user_uuid: string
        }
        Insert: {
          connected_at?: string
          email: string
          id?: string
          tenant_id: number
          tenant_name: string
          updated_at?: string
          user_uuid: string
        }
        Update: {
          connected_at?: string
          email?: string
          id?: string
          tenant_id?: number
          tenant_name?: string
          updated_at?: string
          user_uuid?: string
        }
        Relationships: []
      }
      consult_entries: {
        Row: {
          client_id: string
          consultant_id: string
          created_at: string
          id: string
          minutes: number
          notes: string | null
          project_id: string | null
          task_id: string | null
        }
        Insert: {
          client_id: string
          consultant_id: string
          created_at?: string
          id?: string
          minutes: number
          notes?: string | null
          project_id?: string | null
          task_id?: string | null
        }
        Update: {
          client_id?: string
          consultant_id?: string
          created_at?: string
          id?: string
          minutes?: number
          notes?: string | null
          project_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consult_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consult_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consult_entries_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "consult_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      consult_logs: {
        Row: {
          client_id: string | null
          consult_id: string
          consultant: string
          created_at: string | null
          date: string
          hours: number | null
          task: string | null
        }
        Insert: {
          client_id?: string | null
          consult_id?: string
          consultant: string
          created_at?: string | null
          date: string
          hours?: number | null
          task?: string | null
        }
        Update: {
          client_id?: string | null
          consult_id?: string
          consultant?: string
          created_at?: string | null
          date?: string
          hours?: number | null
          task?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consult_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consult_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      consults: {
        Row: {
          client_id: string
          consultant_id: string
          created_at: string | null
          id: string
          minutes: number
          notes: string | null
          project_id: string | null
          task_id: string | null
          tenant_id: string
        }
        Insert: {
          client_id: string
          consultant_id: string
          created_at?: string | null
          id?: string
          minutes: number
          notes?: string | null
          project_id?: string | null
          task_id?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string
          consultant_id?: string
          created_at?: string | null
          id?: string
          minutes?: number
          notes?: string | null
          project_id?: string | null
          task_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consults_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consults_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consults_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message: string | null
          last_message_time: string | null
          tenant_id: number | null
          title: string
          unread_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          tenant_id?: number | null
          title: string
          unread_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          tenant_id?: number | null
          title?: string
          unread_count?: number | null
        }
        Relationships: []
      }
      course_cache: {
        Row: {
          course_code: string
          data: Json
          id: number
          last_updated: string | null
          rto_id: string
        }
        Insert: {
          course_code: string
          data: Json
          id?: number
          last_updated?: string | null
          rto_id: string
        }
        Update: {
          course_code?: string
          data?: Json
          id?: number
          last_updated?: string | null
          rto_id?: string
        }
        Relationships: []
      }
      ctstates: {
        Row: {
          Code: number
          Description: string
          Seq: number
        }
        Insert: {
          Code: number
          Description: string
          Seq: number
        }
        Update: {
          Code?: number
          Description?: string
          Seq?: number
        }
        Relationships: []
      }
      dd_address_type: {
        Row: {
          code: string
          description: string | null
          id: number
          label: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: number
          label: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
          label?: string
        }
        Relationships: []
      }
      dd_status: {
        Row: {
          code: number
          description: string
          seq: number
          value: string | null
        }
        Insert: {
          code: number
          description: string
          seq: number
          value?: string | null
        }
        Update: {
          code?: number
          description?: string
          seq?: number
          value?: string | null
        }
        Relationships: []
      }
      document_activity_log: {
        Row: {
          activity_type: string
          actor_role: string | null
          actor_user_id: string | null
          client_id: number | null
          created_at: string
          document_id: number
          file_name: string | null
          id: string
          metadata: Json
          occurred_at: string
          package_id: number | null
          stage_id: number | null
          tenant_id: number
        }
        Insert: {
          activity_type: string
          actor_role?: string | null
          actor_user_id?: string | null
          client_id?: number | null
          created_at?: string
          document_id: number
          file_name?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          package_id?: number | null
          stage_id?: number | null
          tenant_id: number
        }
        Update: {
          activity_type?: string
          actor_role?: string | null
          actor_user_id?: string | null
          client_id?: number | null
          created_at?: string
          document_id?: number
          file_name?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          package_id?: number | null
          stage_id?: number | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_activity_log_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      document_ai_audit: {
        Row: {
          action: string
          category_confidence: number | null
          created_at: string | null
          description_confidence: number | null
          document_id: number
          id: string
          overall_confidence: number | null
          reasoning: string | null
          suggested_category: string | null
          suggested_description: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          category_confidence?: number | null
          created_at?: string | null
          description_confidence?: number | null
          document_id: number
          id?: string
          overall_confidence?: number | null
          reasoning?: string | null
          suggested_category?: string | null
          suggested_description?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category_confidence?: number | null
          created_at?: string | null
          description_confidence?: number | null
          document_id?: number
          id?: string
          overall_confidence?: number | null
          reasoning?: string | null
          suggested_category?: string | null
          suggested_description?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_ai_audit_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_ai_audit_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_data_sources: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: number
          id: string
          name: string
          row_count: number | null
          schema: Json | null
          source_type: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: number
          id?: string
          name: string
          row_count?: number | null
          schema?: Json | null
          source_type?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: number
          id?: string
          name?: string
          row_count?: number | null
          schema?: Json | null
          source_type?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_data_sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_data_sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_files: {
        Row: {
          created_at: string
          document_id: number | null
          file_path: string
          file_size: number | null
          file_type: string | null
          id: number
          original_filename: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_id?: number | null
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: number
          original_filename?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_id?: number | null
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: number
          original_filename?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_instances: {
        Row: {
          coments: string | null
          created_at: string
          document_id: number | null
          generationdate: string | null
          id: number
          isgenerated: boolean | null
          stageinstance_id: number | null
          status: string | null
          tenant_id: number | null
          updated_at: string
        }
        Insert: {
          coments?: string | null
          created_at?: string
          document_id?: number | null
          generationdate?: string | null
          id: number
          isgenerated?: boolean | null
          stageinstance_id?: number | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string
        }
        Update: {
          coments?: string | null
          created_at?: string
          document_id?: number | null
          generationdate?: string | null
          id?: number
          isgenerated?: boolean | null
          stageinstance_id?: number | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_instances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_instances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_source_mappings: {
        Row: {
          created_at: string
          data_source_id: string
          document_id: number
          excel_named_range: string
          excel_sheet: string
          id: string
          source_column: string
        }
        Insert: {
          created_at?: string
          data_source_id: string
          document_id: number
          excel_named_range: string
          excel_sheet: string
          id?: string
          source_column: string
        }
        Update: {
          created_at?: string
          data_source_id?: string
          document_id?: number
          excel_named_range?: string
          excel_sheet?: string
          id?: string
          source_column?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_source_mappings_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "document_data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_source_mappings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_source_mappings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: number
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          status: string
          storage_path: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: number
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string
          storage_path: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: number
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string
          storage_path?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documentfields: {
        Row: {
          document_id: number
          field_id: number
          id: number
        }
        Insert: {
          document_id: number
          field_id: number
          id?: never
        }
        Update: {
          document_id?: number
          field_id?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "fk_document"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "fk_document"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_analysis_status: string | null
          ai_category_confidence: number | null
          ai_category_suggestion: string | null
          ai_confidence: number | null
          ai_confidence_score: number | null
          ai_description_confidence: number | null
          ai_description_draft: string | null
          ai_last_run_at: string | null
          ai_reasoning: string | null
          ai_status: string | null
          ai_suggested_category: string | null
          ai_suggested_description: string | null
          category: string | null
          created_by: string | null
          createdat: string | null
          current_published_version_id: string | null
          description: string | null
          detected_dropdown_sources: Json | null
          detected_merge_fields: string[] | null
          document_category: string | null
          document_status: string
          dropdown_sources: Json | null
          due_date: string | null
          file_names: string[] | null
          format: string | null
          framework_type: string | null
          id: number
          is_auto_generated: boolean | null
          is_released: boolean | null
          is_team_only: boolean | null
          is_tenant_downloadable: boolean | null
          isclientdoc: boolean | null
          merge_fields: Json | null
          named_ranges: Json | null
          package_id: number | null
          scan_status: string | null
          scanned_at: string | null
          source_signals: Json | null
          stage: number | null
          standard_refs: string[] | null
          standard_set: string | null
          tenant_id: number | null
          title: string
          updated_at: string | null
          uploaded_files: string[] | null
          user_edited_category: boolean | null
          user_edited_description: boolean | null
          versiondate: string | null
          versionlastupdated: string | null
          versionnumber: number | null
          watermark: boolean | null
        }
        Insert: {
          ai_analysis_status?: string | null
          ai_category_confidence?: number | null
          ai_category_suggestion?: string | null
          ai_confidence?: number | null
          ai_confidence_score?: number | null
          ai_description_confidence?: number | null
          ai_description_draft?: string | null
          ai_last_run_at?: string | null
          ai_reasoning?: string | null
          ai_status?: string | null
          ai_suggested_category?: string | null
          ai_suggested_description?: string | null
          category?: string | null
          created_by?: string | null
          createdat?: string | null
          current_published_version_id?: string | null
          description?: string | null
          detected_dropdown_sources?: Json | null
          detected_merge_fields?: string[] | null
          document_category?: string | null
          document_status?: string
          dropdown_sources?: Json | null
          due_date?: string | null
          file_names?: string[] | null
          format?: string | null
          framework_type?: string | null
          id?: never
          is_auto_generated?: boolean | null
          is_released?: boolean | null
          is_team_only?: boolean | null
          is_tenant_downloadable?: boolean | null
          isclientdoc?: boolean | null
          merge_fields?: Json | null
          named_ranges?: Json | null
          package_id?: number | null
          scan_status?: string | null
          scanned_at?: string | null
          source_signals?: Json | null
          stage?: number | null
          standard_refs?: string[] | null
          standard_set?: string | null
          tenant_id?: number | null
          title: string
          updated_at?: string | null
          uploaded_files?: string[] | null
          user_edited_category?: boolean | null
          user_edited_description?: boolean | null
          versiondate?: string | null
          versionlastupdated?: string | null
          versionnumber?: number | null
          watermark?: boolean | null
        }
        Update: {
          ai_analysis_status?: string | null
          ai_category_confidence?: number | null
          ai_category_suggestion?: string | null
          ai_confidence?: number | null
          ai_confidence_score?: number | null
          ai_description_confidence?: number | null
          ai_description_draft?: string | null
          ai_last_run_at?: string | null
          ai_reasoning?: string | null
          ai_status?: string | null
          ai_suggested_category?: string | null
          ai_suggested_description?: string | null
          category?: string | null
          created_by?: string | null
          createdat?: string | null
          current_published_version_id?: string | null
          description?: string | null
          detected_dropdown_sources?: Json | null
          detected_merge_fields?: string[] | null
          document_category?: string | null
          document_status?: string
          dropdown_sources?: Json | null
          due_date?: string | null
          file_names?: string[] | null
          format?: string | null
          framework_type?: string | null
          id?: never
          is_auto_generated?: boolean | null
          is_released?: boolean | null
          is_team_only?: boolean | null
          is_tenant_downloadable?: boolean | null
          isclientdoc?: boolean | null
          merge_fields?: Json | null
          named_ranges?: Json | null
          package_id?: number | null
          scan_status?: string | null
          scanned_at?: string | null
          source_signals?: Json | null
          stage?: number | null
          standard_refs?: string[] | null
          standard_set?: string | null
          tenant_id?: number | null
          title?: string
          updated_at?: string | null
          uploaded_files?: string[] | null
          user_edited_category?: boolean | null
          user_edited_description?: boolean | null
          versiondate?: string | null
          versionlastupdated?: string | null
          versionnumber?: number | null
          watermark?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_documents_current_version"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      documents_fields: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          label: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          label: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          label?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_fields_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      documents_notes: {
        Row: {
          assignees: string[] | null
          completed_date: string | null
          created_at: string
          created_by: string
          duration: number | null
          file_names: string[] | null
          id: string
          note_details: string
          note_type: string | null
          package_id: number | null
          priority: string | null
          stage_id: number
          started_date: string | null
          tenant_id: number
          updated_at: string
          uploaded_files: string[] | null
        }
        Insert: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          duration?: number | null
          file_names?: string[] | null
          id?: string
          note_details: string
          note_type?: string | null
          package_id?: number | null
          priority?: string | null
          stage_id: number
          started_date?: string | null
          tenant_id: number
          updated_at?: string
          uploaded_files?: string[] | null
        }
        Update: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          duration?: number | null
          file_names?: string[] | null
          id?: string
          note_details?: string
          note_type?: string | null
          package_id?: number | null
          priority?: string | null
          stage_id?: number
          started_date?: string | null
          tenant_id?: number
          updated_at?: string
          uploaded_files?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_notes_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_stages: {
        Row: {
          ai_hint: string | null
          certified_notes: string | null
          covers_standards: string[] | null
          created_at: string
          created_by: string | null
          dashboard_visible: boolean | null
          deprecated_at: string | null
          description: string | null
          effective_date: string | null
          frameworks: string[] | null
          id: number
          is_archived: boolean
          is_certified: boolean
          is_reusable: boolean | null
          registry_code: string | null
          requires_stage_keys: string[] | null
          short_name: string | null
          stage_key: string
          stage_type: string | null
          status: string | null
          title: string
          updated_at: string
          version_label: string | null
          video_url: string | null
        }
        Insert: {
          ai_hint?: string | null
          certified_notes?: string | null
          covers_standards?: string[] | null
          created_at?: string
          created_by?: string | null
          dashboard_visible?: boolean | null
          deprecated_at?: string | null
          description?: string | null
          effective_date?: string | null
          frameworks?: string[] | null
          id?: never
          is_archived?: boolean
          is_certified?: boolean
          is_reusable?: boolean | null
          registry_code?: string | null
          requires_stage_keys?: string[] | null
          short_name?: string | null
          stage_key: string
          stage_type?: string | null
          status?: string | null
          title: string
          updated_at?: string
          version_label?: string | null
          video_url?: string | null
        }
        Update: {
          ai_hint?: string | null
          certified_notes?: string | null
          covers_standards?: string[] | null
          created_at?: string
          created_by?: string | null
          dashboard_visible?: boolean | null
          deprecated_at?: string | null
          description?: string | null
          effective_date?: string | null
          frameworks?: string[] | null
          id?: never
          is_archived?: boolean
          is_certified?: boolean
          is_reusable?: boolean | null
          registry_code?: string | null
          requires_stage_keys?: string[] | null
          short_name?: string | null
          stage_key?: string
          stage_type?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          version_label?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      documents_tenants: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_names: string[] | null
          format: string | null
          id: number
          isclientdoc: boolean | null
          sent_at: string
          sent_by: string | null
          stage: number | null
          tenant_id: number
          title: string
          updated_at: string
          uploaded_files: string[] | null
          versiondate: string | null
          versionlastupdated: string | null
          versionnumber: number | null
          watermark: boolean | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_names?: string[] | null
          format?: string | null
          id?: number
          isclientdoc?: boolean | null
          sent_at?: string
          sent_by?: string | null
          stage?: number | null
          tenant_id: number
          title: string
          updated_at?: string
          uploaded_files?: string[] | null
          versiondate?: string | null
          versionlastupdated?: string | null
          versionnumber?: number | null
          watermark?: boolean | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_names?: string[] | null
          format?: string | null
          id?: number
          isclientdoc?: boolean | null
          sent_at?: string
          sent_by?: string | null
          stage?: number | null
          tenant_id?: number
          title?: string
          updated_at?: string
          uploaded_files?: string[] | null
          versiondate?: string | null
          versionlastupdated?: string | null
          versionnumber?: number | null
          watermark?: boolean | null
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          created_at: string | null
          document_id: number
          email_id: number
          id: string
          order_number: number | null
        }
        Insert: {
          created_at?: string | null
          document_id: number
          email_id: number
          id?: string
          order_number?: number | null
        }
        Update: {
          created_at?: string | null
          document_id?: number
          email_id?: number
          id?: string
          order_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_log: {
        Row: {
          attachment_ids: number[] | null
          created_at: string | null
          email_id: number | null
          email_name: string
          error_message: string | null
          html_content: string
          id: string
          mailgun_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string | null
          subject: string
          tenant_id: number
          trigger_entity_id: string
          trigger_entity_type: string
          trigger_type: string
          updated_at: string | null
          variables_used: Json | null
        }
        Insert: {
          attachment_ids?: number[] | null
          created_at?: string | null
          email_id?: number | null
          email_name: string
          error_message?: string | null
          html_content: string
          id?: string
          mailgun_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          tenant_id: number
          trigger_entity_id: string
          trigger_entity_type: string
          trigger_type: string
          updated_at?: string | null
          variables_used?: Json | null
        }
        Update: {
          attachment_ids?: number[] | null
          created_at?: string | null
          email_id?: number | null
          email_name?: string
          error_message?: string | null
          html_content?: string
          id?: string
          mailgun_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          tenant_id?: number
          trigger_entity_id?: string
          trigger_entity_type?: string
          trigger_type?: string
          updated_at?: string | null
          variables_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_log_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_issues: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          template_slug: string
          user_email: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          template_slug: string
          user_email: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          template_slug?: string
          user_email?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          event: string
          id: string
          mailgun_message_id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          mailgun_message_id: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          mailgun_message_id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      email_instances: {
        Row: {
          bcc: string | null
          cc: string | null
          content: string | null
          email_id: number | null
          id: number
          is_sent: boolean
          sender: string | null
          sender_id: number | null
          sender_uuid: string | null
          sent_date: string | null
          stageinstance_id: number
          subject: string | null
          to: string | null
          user_attachments: string
        }
        Insert: {
          bcc?: string | null
          cc?: string | null
          content?: string | null
          email_id?: number | null
          id?: number
          is_sent: boolean
          sender?: string | null
          sender_id?: number | null
          sender_uuid?: string | null
          sent_date?: string | null
          stageinstance_id: number
          subject?: string | null
          to?: string | null
          user_attachments?: string
        }
        Update: {
          bcc?: string | null
          cc?: string | null
          content?: string | null
          email_id?: number | null
          id?: number
          is_sent?: boolean
          sender?: string | null
          sender_id?: number | null
          sender_uuid?: string | null
          sent_date?: string | null
          stageinstance_id?: number
          subject?: string | null
          to?: string | null
          user_attachments?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_email_instances_email_id"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body: string | null
          created_at: string | null
          error_message: string | null
          id: string
          is_test: boolean | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          template_name: string | null
          to_email: string | null
          variables: Json | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          is_test?: boolean | null
          recipient: string
          sent_at?: string | null
          status: string
          subject: string
          template_id?: string | null
          template_name?: string | null
          to_email?: string | null
          variables?: Json | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          is_test?: boolean | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          template_name?: string | null
          to_email?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "system_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          bcc_emails: string[] | null
          body_html: string
          body_text: string | null
          cc_emails: string[] | null
          client_id: number | null
          created_at: string
          created_by: string | null
          email_template_id: string
          email_template_version: number
          error_message: string | null
          from_email: string | null
          id: string
          last_retry_at: string | null
          merge_data: Json | null
          package_id: number | null
          provider: string | null
          retry_count: number | null
          sent_at: string | null
          stage_id: number | null
          stage_release_id: string | null
          status: string
          subject: string
          tenant_id: number
          to_email: string
        }
        Insert: {
          bcc_emails?: string[] | null
          body_html: string
          body_text?: string | null
          cc_emails?: string[] | null
          client_id?: number | null
          created_at?: string
          created_by?: string | null
          email_template_id: string
          email_template_version?: number
          error_message?: string | null
          from_email?: string | null
          id?: string
          last_retry_at?: string | null
          merge_data?: Json | null
          package_id?: number | null
          provider?: string | null
          retry_count?: number | null
          sent_at?: string | null
          stage_id?: number | null
          stage_release_id?: string | null
          status?: string
          subject: string
          tenant_id: number
          to_email: string
        }
        Update: {
          bcc_emails?: string[] | null
          body_html?: string
          body_text?: string | null
          cc_emails?: string[] | null
          client_id?: number | null
          created_at?: string
          created_by?: string | null
          email_template_id?: string
          email_template_version?: number
          error_message?: string | null
          from_email?: string | null
          id?: string
          last_retry_at?: string | null
          merge_data?: Json | null
          package_id?: number | null
          provider?: string | null
          retry_count?: number | null
          sent_at?: string | null
          stage_id?: number | null
          stage_release_id?: string | null
          status?: string
          subject?: string
          tenant_id?: number
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_stage_release_id_fkey"
            columns: ["stage_release_id"]
            isOneToOne: false
            referencedRelation: "stage_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sends: {
        Row: {
          created_at: string
          error: string | null
          id: string
          mailgun_message_id: string | null
          merge_vars: Json | null
          status: string
          template_id: string | null
          to_address: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          mailgun_message_id?: string | null
          merge_vars?: Json | null
          status?: string
          template_id?: string | null
          to_address: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          mailgun_message_id?: string | null
          merge_vars?: Json | null
          status?: string
          template_id?: string | null
          to_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string
          description: string
          editor_type: string
          from_address: string
          html_body: string
          id: string
          internal_name: string
          preview_text: string | null
          reply_to: string
          slug: string
          status: string | null
          subject: string
          updated_at: string
          updated_by: string | null
          version: number | null
        }
        Insert: {
          created_at?: string
          description: string
          editor_type?: string
          from_address?: string
          html_body: string
          id?: string
          internal_name: string
          preview_text?: string | null
          reply_to?: string
          slug: string
          status?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          editor_type?: string
          from_address?: string
          html_body?: string
          id?: string
          internal_name?: string
          preview_text?: string | null
          reply_to?: string
          slug?: string
          status?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      email_templates_custom: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          auth_mode: boolean
          auto_send_on_document_added: boolean | null
          auto_send_on_document_updated: boolean | null
          auto_send_on_task_assignment: boolean | null
          automation_enabled: boolean | null
          content: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          files: string[] | null
          id: number
          name: string | null
          order_number: number
          package_id: number | null
          stage_id: number | null
          subject: string | null
          to: string | null
          u1_id: number | null
        }
        Insert: {
          auth_mode?: boolean
          auto_send_on_document_added?: boolean | null
          auto_send_on_document_updated?: boolean | null
          auto_send_on_task_assignment?: boolean | null
          automation_enabled?: boolean | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          files?: string[] | null
          id?: never
          name?: string | null
          order_number: number
          package_id?: number | null
          stage_id?: number | null
          subject?: string | null
          to?: string | null
          u1_id?: number | null
        }
        Update: {
          auth_mode?: boolean
          auto_send_on_document_added?: boolean | null
          auto_send_on_document_updated?: boolean | null
          auto_send_on_task_assignment?: boolean | null
          automation_enabled?: boolean | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          files?: string[] | null
          id?: never
          name?: string | null
          order_number?: number
          package_id?: number | null
          stage_id?: number | null
          subject?: string | null
          to?: string | null
          u1_id?: number | null
        }
        Relationships: []
      }
      emails_duplicate: {
        Row: {
          auth_mode: boolean
          auto_send_on_document_added: boolean | null
          auto_send_on_document_updated: boolean | null
          auto_send_on_task_assignment: boolean | null
          automation_enabled: boolean | null
          content: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          files: string[] | null
          id: number
          name: string | null
          order_number: number
          package_id: number | null
          stage_id: number | null
          subject: string | null
          to: string | null
          u1_id: number | null
          uuid_id: string
        }
        Insert: {
          auth_mode?: boolean
          auto_send_on_document_added?: boolean | null
          auto_send_on_document_updated?: boolean | null
          auto_send_on_task_assignment?: boolean | null
          automation_enabled?: boolean | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          files?: string[] | null
          id: number
          name?: string | null
          order_number: number
          package_id?: number | null
          stage_id?: number | null
          subject?: string | null
          to?: string | null
          u1_id?: number | null
          uuid_id?: string
        }
        Update: {
          auth_mode?: boolean
          auto_send_on_document_added?: boolean | null
          auto_send_on_document_updated?: boolean | null
          auto_send_on_task_assignment?: boolean | null
          automation_enabled?: boolean | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          files?: string[] | null
          id?: number
          name?: string | null
          order_number?: number
          package_id?: number | null
          stage_id?: number | null
          subject?: string | null
          to?: string | null
          u1_id?: number | null
          uuid_id?: string
        }
        Relationships: []
      }
      eos_accountability_chart: {
        Row: {
          assigned_user_id: string | null
          client_id: string | null
          created_at: string | null
          id: string
          parent_position_id: string | null
          position_title: string
          roles: Json | null
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          parent_position_id?: string | null
          position_title: string
          roles?: Json | null
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          parent_position_id?: string | null
          position_title?: string
          roles?: Json | null
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_accountability_chart_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_accountability_chart_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_accountability_chart_parent_position_id_fkey"
            columns: ["parent_position_id"]
            isOneToOne: false
            referencedRelation: "eos_accountability_chart"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_agenda_template_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          segments_snapshot: Json
          template_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          segments_snapshot?: Json
          template_id: string
          version_number?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          segments_snapshot?: Json
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "eos_agenda_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_agenda_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_version_id: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_default: boolean | null
          is_system: boolean
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          segments: Json
          template_name: string
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean | null
          is_system?: boolean
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          segments?: Json
          template_name: string
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean | null
          is_system?: boolean
          meeting_type?: Database["public"]["Enums"]["eos_meeting_type"]
          segments?: Json
          template_name?: string
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_agenda_templates_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          details: Json | null
          dimension: string
          dismiss_reason: string | null
          dismissed_by: string | null
          id: string
          last_notified_at: string | null
          message: string
          resolved_at: string | null
          severity: string
          source_entity_id: string | null
          source_entity_type: string | null
          status: string
          tenant_id: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          details?: Json | null
          dimension: string
          dismiss_reason?: string | null
          dismissed_by?: string | null
          id?: string
          last_notified_at?: string | null
          message: string
          resolved_at?: string | null
          severity: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          tenant_id: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          details?: Json | null
          dimension?: string
          dismiss_reason?: string | null
          dismissed_by?: string | null
          id?: string
          last_notified_at?: string | null
          message?: string
          resolved_at?: string | null
          severity?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          status?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "eos_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_chart_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          draft_json: Json
          id: string
          meeting_id: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_json?: Json
          id?: string
          meeting_id?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_json?: Json
          id?: string
          meeting_id?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_chart_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_chart_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_chart_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_chart_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_flight_plans: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          measurables: Json | null
          month_1_focus: Json | null
          month_2_focus: Json | null
          month_3_focus: Json | null
          profit_target: number | null
          quarter_number: number
          quarter_year: number
          quarterly_objective: string | null
          revenue_target: number | null
          stop_doing: Json | null
          success_indicators: Json | null
          tenant_id: number
          updated_at: string
          updated_by: string | null
          win_condition: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          measurables?: Json | null
          month_1_focus?: Json | null
          month_2_focus?: Json | null
          month_3_focus?: Json | null
          profit_target?: number | null
          quarter_number: number
          quarter_year: number
          quarterly_objective?: string | null
          revenue_target?: number | null
          stop_doing?: Json | null
          success_indicators?: Json | null
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
          win_condition?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          measurables?: Json | null
          month_1_focus?: Json | null
          month_2_focus?: Json | null
          month_3_focus?: Json | null
          profit_target?: number | null
          quarter_number?: number
          quarter_year?: number
          quarterly_objective?: string | null
          revenue_target?: number | null
          stop_doing?: Json | null
          success_indicators?: Json | null
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
          win_condition?: string | null
        }
        Relationships: []
      }
      eos_headlines: {
        Row: {
          created_at: string | null
          headline: string
          id: string
          is_good_news: boolean | null
          meeting_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          headline: string
          id?: string
          is_good_news?: boolean | null
          meeting_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          headline?: string
          id?: string
          is_good_news?: boolean | null
          meeting_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_headlines_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_headlines_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_headlines_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_headlines_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_health_snapshots: {
        Row: {
          cadence_score: number
          created_at: string
          id: string
          ids_score: number
          overall_band: string
          overall_score: number
          people_score: number
          quarterly_score: number
          rocks_score: number
          snapshot_date: string
          tenant_id: number
        }
        Insert: {
          cadence_score: number
          created_at?: string
          id?: string
          ids_score: number
          overall_band: string
          overall_score: number
          people_score: number
          quarterly_score: number
          rocks_score: number
          snapshot_date: string
          tenant_id: number
        }
        Update: {
          cadence_score?: number
          created_at?: string
          id?: string
          ids_score?: number
          overall_band?: string
          overall_score?: number
          people_score?: number
          quarterly_score?: number
          rocks_score?: number
          snapshot_date?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "eos_health_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_issue_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["eos_issue_status"]
          to_status: Database["public"]["Enums"]["eos_issue_status"]
        }
        Insert: {
          from_status: Database["public"]["Enums"]["eos_issue_status"]
          to_status: Database["public"]["Enums"]["eos_issue_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["eos_issue_status"]
          to_status?: Database["public"]["Enums"]["eos_issue_status"]
        }
        Relationships: []
      }
      eos_issues: {
        Row: {
          assigned_to: string | null
          category: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          escalated_at: string | null
          escalation_reason: string | null
          id: string
          impact: string | null
          item_type: string | null
          linked_rock_id: string | null
          meeting_id: string | null
          meeting_segment_id: string | null
          outcome_note: string | null
          priority: number | null
          quarter_number: number | null
          quarter_year: number | null
          raised_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          solution: string | null
          solved_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["eos_issue_status"] | null
          tenant_id: number
          title: string
          updated_at: string | null
          why_it_matters: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          impact?: string | null
          item_type?: string | null
          linked_rock_id?: string | null
          meeting_id?: string | null
          meeting_segment_id?: string | null
          outcome_note?: string | null
          priority?: number | null
          quarter_number?: number | null
          quarter_year?: number | null
          raised_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          solution?: string | null
          solved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["eos_issue_status"] | null
          tenant_id: number
          title: string
          updated_at?: string | null
          why_it_matters?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          id?: string
          impact?: string | null
          item_type?: string | null
          linked_rock_id?: string | null
          meeting_id?: string | null
          meeting_segment_id?: string | null
          outcome_note?: string | null
          priority?: number | null
          quarter_number?: number | null
          quarter_year?: number | null
          raised_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          solution?: string | null
          solved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["eos_issue_status"] | null
          tenant_id?: number
          title?: string
          updated_at?: string | null
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_issues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_linked_rock_id_fkey"
            columns: ["linked_rock_id"]
            isOneToOne: false
            referencedRelation: "eos_rocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_issues_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_meeting_segment_id_fkey"
            columns: ["meeting_segment_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_item_clients: {
        Row: {
          client_id: string
          created_at: string
          id: string
          item_id: string
          item_type: string
          tenant_id: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          tenant_id: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          tenant_id?: number
        }
        Relationships: []
      }
      eos_meeting_attendees: {
        Row: {
          attendance_status: Database["public"]["Enums"]["meeting_attendance_status"]
          created_at: string
          id: string
          joined_at: string | null
          left_at: string | null
          marked_by: string | null
          meeting_id: string
          notes: string | null
          role_in_meeting: Database["public"]["Enums"]["meeting_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_status?: Database["public"]["Enums"]["meeting_attendance_status"]
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          marked_by?: string | null
          meeting_id: string
          notes?: string | null
          role_in_meeting?: Database["public"]["Enums"]["meeting_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_status?: Database["public"]["Enums"]["meeting_attendance_status"]
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          marked_by?: string | null
          meeting_id?: string
          notes?: string | null
          role_in_meeting?: Database["public"]["Enums"]["meeting_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_attendees_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "eos_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      eos_meeting_minutes_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          is_final: boolean
          is_locked: boolean
          meeting_id: string
          minutes_snapshot: Json
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_final?: boolean
          is_locked?: boolean
          meeting_id: string
          minutes_snapshot?: Json
          version_number?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_final?: boolean
          is_locked?: boolean
          meeting_id?: string
          minutes_snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_minutes_versions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_minutes_versions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_minutes_versions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_minutes_versions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_occurrences: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_generated: boolean | null
          meeting_id: string | null
          recurrence_id: string | null
          starts_at: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_generated?: boolean | null
          meeting_id?: string | null
          recurrence_id?: string | null
          starts_at: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_generated?: boolean | null
          meeting_id?: string | null
          recurrence_id?: string | null
          starts_at?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_occurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_occurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_occurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_occurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_occurrences_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_recurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_outcome_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          id: string
          justification: string
          meeting_id: string
          outcome_type: string
          tenant_id: number
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          id?: string
          justification: string
          meeting_id: string
          outcome_type: string
          tenant_id: number
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          justification?: string
          meeting_id?: string
          outcome_type?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_outcome_confirmations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_outcome_confirmations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_outcome_confirmations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_outcome_confirmations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_participants: {
        Row: {
          attended: boolean | null
          created_at: string | null
          id: string
          meeting_id: string
          role: Database["public"]["Enums"]["eos_participant_role"] | null
          user_id: string
        }
        Insert: {
          attended?: boolean | null
          created_at?: string | null
          id?: string
          meeting_id: string
          role?: Database["public"]["Enums"]["eos_participant_role"] | null
          user_id: string
        }
        Update: {
          attended?: boolean | null
          created_at?: string | null
          id?: string
          meeting_id?: string
          role?: Database["public"]["Enums"]["eos_participant_role"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_ratings: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          rating: number
          tenant_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          rating: number
          tenant_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          rating?: number
          tenant_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_ratings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_ratings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_ratings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_ratings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_recurrences: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          meeting_id: string | null
          recurrence_type: string
          rrule: string
          start_date: string
          tenant_id: number
          timezone: string
          until_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id?: string | null
          recurrence_type: string
          rrule: string
          start_date: string
          tenant_id: number
          timezone?: string
          until_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id?: string | null
          recurrence_type?: string
          rrule?: string
          start_date?: string
          tenant_id?: number
          timezone?: string
          until_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_recurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_recurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_recurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_recurrences_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_segments: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_minutes: number
          id: string
          meeting_id: string
          notes: string | null
          segment_name: string
          sequence_order: number
          started_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_minutes: number
          id?: string
          meeting_id: string
          notes?: string | null
          segment_name: string
          sequence_order: number
          started_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_minutes?: number
          id?: string
          meeting_id?: string
          notes?: string | null
          segment_name?: string
          sequence_order?: number
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meeting_series: {
        Row: {
          agenda_template_id: string | null
          agenda_template_version_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          location: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          recurrence_rule: string | null
          recurrence_type: string
          start_date: string
          start_time: string
          tenant_id: number
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda_template_id?: string | null
          agenda_template_version_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          location?: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          recurrence_rule?: string | null
          recurrence_type: string
          start_date: string
          start_time?: string
          tenant_id: number
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda_template_id?: string | null
          agenda_template_version_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          location?: string | null
          meeting_type?: Database["public"]["Enums"]["eos_meeting_type"]
          recurrence_rule?: string | null
          recurrence_type?: string
          start_date?: string
          start_time?: string
          tenant_id?: number
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      eos_meeting_summaries: {
        Row: {
          attendance: Json | null
          cascades: Json | null
          chart_changes: Json | null
          created_at: string
          emailed_at: string | null
          headlines: Json | null
          id: string
          issues: Json | null
          meeting_id: string
          meeting_type: string | null
          period_range: string | null
          rating: number | null
          rocks: Json | null
          tenant_id: number
          todos: Json | null
          vto_changes: Json | null
        }
        Insert: {
          attendance?: Json | null
          cascades?: Json | null
          chart_changes?: Json | null
          created_at?: string
          emailed_at?: string | null
          headlines?: Json | null
          id?: string
          issues?: Json | null
          meeting_id: string
          meeting_type?: string | null
          period_range?: string | null
          rating?: number | null
          rocks?: Json | null
          tenant_id: number
          todos?: Json | null
          vto_changes?: Json | null
        }
        Update: {
          attendance?: Json | null
          cascades?: Json | null
          chart_changes?: Json | null
          created_at?: string
          emailed_at?: string | null
          headlines?: Json | null
          id?: string
          issues?: Json | null
          meeting_id?: string
          meeting_type?: string | null
          period_range?: string | null
          rating?: number | null
          rocks?: Json | null
          tenant_id?: number
          todos?: Json | null
          vto_changes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meetings: {
        Row: {
          actual_duration_minutes: number | null
          agenda_snapshot: Json | null
          client_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_minutes_version_id: string | null
          duration_minutes: number | null
          fiscal_quarter: number | null
          fiscal_year: number | null
          headlines: Json | null
          id: string
          is_complete: boolean | null
          is_multi_client: boolean | null
          issues_discussed: string[] | null
          location: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          minutes_status: string
          next_meeting_id: string | null
          notes: string | null
          parent_meeting_id: string | null
          previous_meeting_id: string | null
          quorum_met: boolean | null
          quorum_override_by: string | null
          quorum_override_reason: string | null
          quorum_status: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          rock_reviews: Json | null
          scheduled_date: string
          scorecard_data: Json | null
          series_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["meeting_status"]
          template_id: string | null
          template_version_id: string | null
          tenant_id: number
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_duration_minutes?: number | null
          agenda_snapshot?: Json | null
          client_id?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_minutes_version_id?: string | null
          duration_minutes?: number | null
          fiscal_quarter?: number | null
          fiscal_year?: number | null
          headlines?: Json | null
          id?: string
          is_complete?: boolean | null
          is_multi_client?: boolean | null
          issues_discussed?: string[] | null
          location?: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          minutes_status?: string
          next_meeting_id?: string | null
          notes?: string | null
          parent_meeting_id?: string | null
          previous_meeting_id?: string | null
          quorum_met?: boolean | null
          quorum_override_by?: string | null
          quorum_override_reason?: string | null
          quorum_status?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          rock_reviews?: Json | null
          scheduled_date: string
          scorecard_data?: Json | null
          series_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          template_id?: string | null
          template_version_id?: string | null
          tenant_id: number
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_duration_minutes?: number | null
          agenda_snapshot?: Json | null
          client_id?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_minutes_version_id?: string | null
          duration_minutes?: number | null
          fiscal_quarter?: number | null
          fiscal_year?: number | null
          headlines?: Json | null
          id?: string
          is_complete?: boolean | null
          is_multi_client?: boolean | null
          issues_discussed?: string[] | null
          location?: string | null
          meeting_type?: Database["public"]["Enums"]["eos_meeting_type"]
          minutes_status?: string
          next_meeting_id?: string | null
          notes?: string | null
          parent_meeting_id?: string | null
          previous_meeting_id?: string | null
          quorum_met?: boolean | null
          quorum_override_by?: string | null
          quorum_override_reason?: string | null
          quorum_status?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          rock_reviews?: Json | null
          scheduled_date?: string
          scorecard_data?: Json | null
          series_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          template_id?: string | null
          template_version_id?: string | null
          tenant_id?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_next_meeting_id_fkey"
            columns: ["next_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meetings_next_meeting_id_fkey"
            columns: ["next_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_next_meeting_id_fkey"
            columns: ["next_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_next_meeting_id_fkey"
            columns: ["next_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_previous_meeting_id_fkey"
            columns: ["previous_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meetings_previous_meeting_id_fkey"
            columns: ["previous_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_previous_meeting_id_fkey"
            columns: ["previous_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_previous_meeting_id_fkey"
            columns: ["previous_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_quorum_override_by_fkey"
            columns: ["quorum_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "eos_meetings_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_current_minutes_version"
            columns: ["current_minutes_version_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_minutes_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_minutes_audit_log: {
        Row: {
          action: string
          change_summary: string | null
          created_at: string
          details: Json | null
          id: string
          meeting_id: string
          minutes_version_id: string | null
          tenant_id: number
          user_id: string | null
        }
        Insert: {
          action: string
          change_summary?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          meeting_id: string
          minutes_version_id?: string | null
          tenant_id: number
          user_id?: string | null
        }
        Update: {
          action?: string
          change_summary?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          meeting_id?: string
          minutes_version_id?: string | null
          tenant_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_minutes_audit_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_minutes_audit_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_minutes_audit_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_minutes_audit_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_minutes_audit_log_minutes_version_id_fkey"
            columns: ["minutes_version_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_minutes_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          manager_ids: string[]
          quarter_end: string
          quarter_start: string
          reviewee_id: string
          scheduled_at: string | null
          status: string
          template_id: string | null
          tenant_id: number
          updated_at: string
          visibility: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          manager_ids: string[]
          quarter_end: string
          quarter_start: string
          reviewee_id: string
          scheduled_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          manager_ids?: string[]
          quarter_end?: string
          quarter_start?: string
          reviewee_id?: string
          scheduled_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_qc_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eos_qc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc_answers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          prompt_key: string
          qc_id: string
          section_key: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_key: string
          qc_id: string
          section_key: string
          updated_at?: string
          value_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_key?: string
          qc_id?: string
          section_key?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "eos_qc_answers_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: false
            referencedRelation: "eos_qc"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_url: string
          id: string
          mime_type: string | null
          qc_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_url: string
          id?: string
          mime_type?: string | null
          qc_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_url?: string
          id?: string
          mime_type?: string | null
          qc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_qc_attachments_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: false
            referencedRelation: "eos_qc"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc_fit: {
        Row: {
          capacity: boolean | null
          created_at: string
          gets_it: boolean | null
          id: string
          notes: string | null
          qc_id: string
          seat_id: string | null
          updated_at: string
          wants_it: boolean | null
        }
        Insert: {
          capacity?: boolean | null
          created_at?: string
          gets_it?: boolean | null
          id?: string
          notes?: string | null
          qc_id: string
          seat_id?: string | null
          updated_at?: string
          wants_it?: boolean | null
        }
        Update: {
          capacity?: boolean | null
          created_at?: string
          gets_it?: boolean | null
          id?: string
          notes?: string | null
          qc_id?: string
          seat_id?: string | null
          updated_at?: string
          wants_it?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_qc_fit_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: true
            referencedRelation: "eos_qc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_qc_fit_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "eos_accountability_chart"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          linked_id: string
          linked_type: string
          qc_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_id: string
          linked_type: string
          qc_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_id?: string
          linked_type?: string
          qc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_qc_links_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: false
            referencedRelation: "eos_qc"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc_signoffs: {
        Row: {
          id: string
          qc_id: string
          role: string
          signed_at: string
          signed_by: string
        }
        Insert: {
          id?: string
          qc_id: string
          role: string
          signed_at?: string
          signed_by: string
        }
        Update: {
          id?: string
          qc_id?: string
          role?: string
          signed_at?: string
          signed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_qc_signoffs_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: false
            referencedRelation: "eos_qc"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_qc_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          sections: Json
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          sections?: Json
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sections?: Json
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      eos_rocks: {
        Row: {
          client_id: string | null
          completed_date: string | null
          completion_percentage: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          issue: string | null
          level: string | null
          linked_risk_ids: string[] | null
          milestones: Json | null
          outcome: string | null
          owner_id: string | null
          priority: number | null
          quarter_end: string | null
          quarter_number: number
          quarter_start: string | null
          quarter_year: number
          seat_id: string | null
          seat_owner_user_id: string | null
          status: Database["public"]["Enums"]["eos_rock_status"] | null
          status_note: string | null
          tenant_id: number
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          completed_date?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          issue?: string | null
          level?: string | null
          linked_risk_ids?: string[] | null
          milestones?: Json | null
          outcome?: string | null
          owner_id?: string | null
          priority?: number | null
          quarter_end?: string | null
          quarter_number: number
          quarter_start?: string | null
          quarter_year: number
          seat_id?: string | null
          seat_owner_user_id?: string | null
          status?: Database["public"]["Enums"]["eos_rock_status"] | null
          status_note?: string | null
          tenant_id: number
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          completed_date?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          issue?: string | null
          level?: string | null
          linked_risk_ids?: string[] | null
          milestones?: Json | null
          outcome?: string | null
          owner_id?: string | null
          priority?: number | null
          quarter_end?: string | null
          quarter_number?: number
          quarter_start?: string | null
          quarter_year?: number
          seat_id?: string | null
          seat_owner_user_id?: string | null
          status?: Database["public"]["Enums"]["eos_rock_status"] | null
          status_note?: string | null
          tenant_id?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_rocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_rocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_rocks_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_rocks_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
        ]
      }
      eos_scorecard: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      eos_scorecard_entries: {
        Row: {
          entered_at: string
          entered_by: string
          id: string
          metric_id: string
          notes: string | null
          recorded_by: string | null
          tenant_id: number
          value: number
          week_ending: string
        }
        Insert: {
          entered_at?: string
          entered_by: string
          id?: string
          metric_id: string
          notes?: string | null
          recorded_by?: string | null
          tenant_id: number
          value: number
          week_ending: string
        }
        Update: {
          entered_at?: string
          entered_by?: string
          id?: string
          metric_id?: string
          notes?: string | null
          recorded_by?: string | null
          tenant_id?: number
          value?: number
          week_ending?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_scorecard_entries_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "eos_scorecard_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_scorecard_metrics: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          frequency: string
          goal_value: number
          id: string
          is_active: boolean
          metric_name: string
          name: string
          order_index: number
          owner_id: string | null
          scorecard_id: string
          target_value: number | null
          tenant_id: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          frequency?: string
          goal_value: number
          id?: string
          is_active?: boolean
          metric_name: string
          name: string
          order_index?: number
          owner_id?: string | null
          scorecard_id: string
          target_value?: number | null
          tenant_id: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          frequency?: string
          goal_value?: number
          id?: string
          is_active?: boolean
          metric_name?: string
          name?: string
          order_index?: number
          owner_id?: string | null
          scorecard_id?: string
          target_value?: number | null
          tenant_id?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_scorecard_metrics_scorecard"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "eos_scorecard"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_template_audit_log: {
        Row: {
          action: string
          change_summary: string | null
          created_at: string
          details: Json | null
          id: string
          template_id: string | null
          tenant_id: number
          user_id: string | null
          version_id: string | null
        }
        Insert: {
          action: string
          change_summary?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          template_id?: string | null
          tenant_id: number
          user_id?: string | null
          version_id?: string | null
        }
        Update: {
          action?: string
          change_summary?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          template_id?: string | null
          tenant_id?: number
          user_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_template_audit_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_template_audit_log_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_todos: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          completed_at: string | null
          completed_date: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          meeting_id: string | null
          owner_id: string | null
          status: Database["public"]["Enums"]["eos_todo_status"] | null
          tenant_id: number
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          completed_at?: string | null
          completed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          owner_id?: string | null
          status?: Database["public"]["Enums"]["eos_todo_status"] | null
          tenant_id: number
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          completed_at?: string | null
          completed_date?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          owner_id?: string | null
          status?: Database["public"]["Enums"]["eos_todo_status"] | null
          tenant_id?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_todos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_todos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_todos_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_todos_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_todos_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_todos_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: Database["public"]["Enums"]["eos_role"]
          tenant_id: number
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["eos_role"]
          tenant_id: number
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["eos_role"]
          tenant_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "eos_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      eos_vto: {
        Row: {
          client_id: string | null
          core_values: Json | null
          created_at: string | null
          created_by: string | null
          guarantee: string | null
          id: string
          one_year_goals: Json | null
          one_year_measurables: Json | null
          one_year_profit_target: number | null
          one_year_revenue_target: number | null
          one_year_target_date: string | null
          proven_process: Json | null
          status: string
          target_market: string | null
          ten_year_target: string | null
          tenant_id: number | null
          three_uniques: Json | null
          three_year_measurables: Json | null
          three_year_profit_target: number | null
          three_year_revenue_target: number | null
          three_year_target_date: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          core_values?: Json | null
          created_at?: string | null
          created_by?: string | null
          guarantee?: string | null
          id?: string
          one_year_goals?: Json | null
          one_year_measurables?: Json | null
          one_year_profit_target?: number | null
          one_year_revenue_target?: number | null
          one_year_target_date?: string | null
          proven_process?: Json | null
          status?: string
          target_market?: string | null
          ten_year_target?: string | null
          tenant_id?: number | null
          three_uniques?: Json | null
          three_year_measurables?: Json | null
          three_year_profit_target?: number | null
          three_year_revenue_target?: number | null
          three_year_target_date?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          core_values?: Json | null
          created_at?: string | null
          created_by?: string | null
          guarantee?: string | null
          id?: string
          one_year_goals?: Json | null
          one_year_measurables?: Json | null
          one_year_profit_target?: number | null
          one_year_revenue_target?: number | null
          one_year_target_date?: string | null
          proven_process?: Json | null
          status?: string
          target_market?: string | null
          ten_year_target?: string | null
          tenant_id?: number | null
          three_uniques?: Json | null
          three_year_measurables?: Json | null
          three_year_profit_target?: number | null
          three_year_revenue_target?: number | null
          three_year_target_date?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_vto_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_vto_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_vto_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          draft_json: Json
          id: string
          meeting_id: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_json?: Json
          id?: string
          meeting_id?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_json?: Json
          id?: string
          meeting_id?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eos_vto_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_vto_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_vto_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_vto_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_vto_versions: {
        Row: {
          content: Json
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          notes: string | null
          tenant_id: number
          version_number: number
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tenant_id: number
          version_number?: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tenant_id?: number
          version_number?: number
        }
        Relationships: []
      }
      excel_generated_files: {
        Row: {
          client_legacy_id: string | null
          document_id: number
          dropdown_data_used: Json | null
          file_name: string | null
          generated_at: string
          generated_by: string | null
          id: string
          merge_data_used: Json | null
          package_id: number | null
          stage_id: number | null
          storage_path: string
          tenant_id: number
        }
        Insert: {
          client_legacy_id?: string | null
          document_id: number
          dropdown_data_used?: Json | null
          file_name?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          merge_data_used?: Json | null
          package_id?: number | null
          stage_id?: number | null
          storage_path: string
          tenant_id: number
        }
        Update: {
          client_legacy_id?: string | null
          document_id?: number
          dropdown_data_used?: Json | null
          file_name?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          merge_data_used?: Json | null
          package_id?: number | null
          stage_id?: number | null
          storage_path?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "excel_generated_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "excel_generated_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excel_generated_files_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_template_bindings: {
        Row: {
          binding_version: number
          created_at: string
          detected_dropdowns: Json
          detected_tokens: Json
          document_id: number
          dropdown_bindings: Json
          id: string
          last_validated_at: string | null
          status: string
          token_bindings: Json
          updated_at: string
          validation_errors: Json
        }
        Insert: {
          binding_version?: number
          created_at?: string
          detected_dropdowns?: Json
          detected_tokens?: Json
          document_id: number
          dropdown_bindings?: Json
          id?: string
          last_validated_at?: string | null
          status?: string
          token_bindings?: Json
          updated_at?: string
          validation_errors?: Json
        }
        Update: {
          binding_version?: number
          created_at?: string
          detected_dropdowns?: Json
          detected_tokens?: Json
          document_id?: number
          dropdown_bindings?: Json
          id?: string
          last_validated_at?: string | null
          status?: string
          token_bindings?: Json
          updated_at?: string
          validation_errors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "excel_template_bindings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "excel_template_bindings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          client_legacy_id: string | null
          created_at: string | null
          document_version_id: string | null
          error_message: string | null
          file_name: string
          file_path: string
          generated_at: string | null
          generated_by: string | null
          id: string
          last_retry_at: string | null
          merge_data: Json | null
          package_id: number | null
          retry_count: number | null
          source_document_id: number | null
          stage_id: number | null
          status: string | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          client_legacy_id?: string | null
          created_at?: string | null
          document_version_id?: string | null
          error_message?: string | null
          file_name: string
          file_path: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          last_retry_at?: string | null
          merge_data?: Json | null
          package_id?: number | null
          retry_count?: number | null
          source_document_id?: number | null
          stage_id?: number | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          client_legacy_id?: string | null
          created_at?: string | null
          document_version_id?: string | null
          error_message?: string | null
          file_name?: string
          file_path?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          last_retry_at?: string | null
          merge_data?: Json | null
          package_id?: number | null
          retry_count?: number | null
          source_document_id?: number | null
          stage_id?: number | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_client_legacy_id_fkey"
            columns: ["client_legacy_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_client_legacy_id_fkey"
            columns: ["client_legacy_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "generated_documents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_slack: {
        Row: {
          bot_user_id: string | null
          created_at: string
          default_channel: string | null
          enabled: boolean
          id: string
          oauth_token: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          bot_user_id?: string | null
          created_at?: string
          default_channel?: string | null
          enabled?: boolean
          id?: string
          oauth_token: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          bot_user_id?: string | null
          created_at?: string
          default_channel?: string | null
          enabled?: boolean
          id?: string
          oauth_token?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      integration_teams: {
        Row: {
          bot_user_id: string | null
          created_at: string
          default_channel: string | null
          enabled: boolean
          id: string
          oauth_token: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          bot_user_id?: string | null
          created_at?: string
          default_channel?: string | null
          enabled?: boolean
          id?: string
          oauth_token: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          bot_user_id?: string | null
          created_at?: string
          default_channel?: string | null
          enabled?: boolean
          id?: string
          oauth_token?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      invitation_tokens: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organisation_id: number | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organisation_id?: number | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organisation_id?: number | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_tokens_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      labels: {
        Row: {
          client_id: string | null
          color: string | null
          id: string
          name: string
        }
        Insert: {
          client_id?: string | null
          color?: string | null
          id?: string
          name: string
        }
        Update: {
          client_id?: string | null
          color?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_client_map: {
        Row: {
          client_id: string
          migrated_at: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          client_id: string
          migrated_at?: string
          notes?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string
          migrated_at?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      lookup_list_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          list_id: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          list_id: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          list_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "lookup_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lookup_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string
          name: string
          tenant_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key: string
          name: string
          tenant_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string
          name?: string
          tenant_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      membership_activity: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          package_id: number
          tenant_id: number
          title: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          package_id: number
          tenant_id: number
          title: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          package_id?: number
          tenant_id?: number
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      membership_ai_suggestions: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          content: string
          created_at: string
          id: string
          metadata: Json | null
          package_id: number
          priority: string
          status: string
          suggestion_type: string
          tenant_id: number
          title: string
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          package_id: number
          priority?: string
          status?: string
          suggestion_type: string
          tenant_id: number
          title: string
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          package_id?: number
          priority?: string
          status?: string
          suggestion_type?: string
          tenant_id?: number
          title?: string
        }
        Relationships: []
      }
      membership_entitlements: {
        Row: {
          created_at: string
          csc_user_id: string | null
          current_stage_state_id: number | null
          health_check_delivered_at: string | null
          health_check_scheduled_date: string | null
          health_check_status: string
          hours_included_monthly: number
          hours_used_current_month: number
          id: string
          last_activity_at: string | null
          membership_started_at: string
          membership_state: string
          month_start_date: string
          package_id: number
          setup_complete: boolean
          setup_completed_at: string | null
          setup_completed_by: string | null
          tenant_id: number
          updated_at: string
          validation_delivered_at: string | null
          validation_scheduled_date: string | null
          validation_status: string
        }
        Insert: {
          created_at?: string
          csc_user_id?: string | null
          current_stage_state_id?: number | null
          health_check_delivered_at?: string | null
          health_check_scheduled_date?: string | null
          health_check_status?: string
          hours_included_monthly?: number
          hours_used_current_month?: number
          id?: string
          last_activity_at?: string | null
          membership_started_at?: string
          membership_state?: string
          month_start_date?: string
          package_id: number
          setup_complete?: boolean
          setup_completed_at?: string | null
          setup_completed_by?: string | null
          tenant_id: number
          updated_at?: string
          validation_delivered_at?: string | null
          validation_scheduled_date?: string | null
          validation_status?: string
        }
        Update: {
          created_at?: string
          csc_user_id?: string | null
          current_stage_state_id?: number | null
          health_check_delivered_at?: string | null
          health_check_scheduled_date?: string | null
          health_check_status?: string
          hours_included_monthly?: number
          hours_used_current_month?: number
          id?: string
          last_activity_at?: string | null
          membership_started_at?: string
          membership_state?: string
          month_start_date?: string
          package_id?: number
          setup_complete?: boolean
          setup_completed_at?: string | null
          setup_completed_by?: string | null
          tenant_id?: number
          updated_at?: string
          validation_delivered_at?: string | null
          validation_scheduled_date?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_entitlements_current_stage_state_id_fkey"
            columns: ["current_stage_state_id"]
            isOneToOne: false
            referencedRelation: "client_package_stage_state"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          note_type: string
          package_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          note_type?: string
          package_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          note_type?: string
          package_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      membership_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          package_id: number
          priority: string
          status: string
          task_type: string
          tenant_id: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          package_id: number
          priority?: string
          status?: string
          task_type?: string
          tenant_id: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          package_id?: number
          priority?: string
          status?: string
          task_type?: string
          tenant_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      merge_field_definitions: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          source_column: string
          source_table: string
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          source_column: string
          source_table: string
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          source_column?: string
          source_table?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          assignees: string[] | null
          completed_date: string | null
          created_at: string
          created_by: string
          date_imported: string | null
          duration: number | null
          file_names: string[] | null
          id: string
          is_pinned: boolean
          note_details: string
          note_type: string | null
          package_id: number | null
          parent_id: number | null
          parent_type: string | null
          parent_uuid: string | null
          priority: string | null
          started_date: string | null
          tags: string[]
          tenant_id: number
          tenant_uuid: string | null
          title: string | null
          u1_id: number | null
          u1_package: string | null
          u1_package_id: number | null
          u1_staffname: string | null
          u1_userid: number | null
          updated_at: string
          uploaded_files: string[] | null
          user_id: number | null
          user_uuid: string | null
        }
        Insert: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          date_imported?: string | null
          duration?: number | null
          file_names?: string[] | null
          id?: string
          is_pinned?: boolean
          note_details: string
          note_type?: string | null
          package_id?: number | null
          parent_id?: number | null
          parent_type?: string | null
          parent_uuid?: string | null
          priority?: string | null
          started_date?: string | null
          tags?: string[]
          tenant_id: number
          tenant_uuid?: string | null
          title?: string | null
          u1_id?: number | null
          u1_package?: string | null
          u1_package_id?: number | null
          u1_staffname?: string | null
          u1_userid?: number | null
          updated_at?: string
          uploaded_files?: string[] | null
          user_id?: number | null
          user_uuid?: string | null
        }
        Update: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          date_imported?: string | null
          duration?: number | null
          file_names?: string[] | null
          id?: string
          is_pinned?: boolean
          note_details?: string
          note_type?: string | null
          package_id?: number | null
          parent_id?: number | null
          parent_type?: string | null
          parent_uuid?: string | null
          priority?: string | null
          started_date?: string | null
          tags?: string[]
          tenant_id?: number
          tenant_uuid?: string | null
          title?: string | null
          u1_id?: number | null
          u1_package?: string | null
          u1_package_id?: number | null
          u1_staffname?: string | null
          u1_userid?: number | null
          updated_at?: string
          uploaded_files?: string[] | null
          user_id?: number | null
          user_uuid?: string | null
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          id: string
          payload: Json
          scheduled_at: string
          status: string
          tenant_id: number
          type: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          payload?: Json
          scheduled_at?: string
          status?: string
          tenant_id: number
          type: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          payload?: Json
          scheduled_at?: string
          status?: string
          tenant_id?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_schedule: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          error_message: string | null
          escalated_to: string | null
          escalation_level: number | null
          id: string
          notification_type: string
          scheduled_for: string
          sent_at: string | null
          status: string | null
          tenant_id: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          escalated_to?: string | null
          escalation_level?: number | null
          id?: string
          notification_type: string
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          tenant_id: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          escalated_to?: string | null
          escalation_level?: number | null
          id?: string
          notification_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          tenant_id?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_tenants: {
        Row: {
          created_at: string
          document_id: number | null
          id: string
          is_read: boolean
          message: string
          tenant_id: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: number | null
          id?: string
          is_read?: boolean
          message: string
          tenant_id: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: number | null
          id?: string
          is_read?: boolean
          message?: string
          tenant_id?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_tenants_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          data: Json
          expires_at: string
          state: string
        }
        Insert: {
          created_at?: string
          data: Json
          expires_at: string
          state: string
        }
        Update: {
          created_at?: string
          data?: Json
          expires_at?: string
          state?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          provider: string
          refresh_token: string
          scope: string | null
          tenant_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          provider?: string
          refresh_token: string
          scope?: string | null
          tenant_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          refresh_token?: string
          scope?: string | null
          tenant_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      package_builder_audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          package_id: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          package_id?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          package_id?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      package_client_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date_offset: number | null
          id: string
          instructions: string | null
          is_deleted: boolean
          is_override: boolean
          name: string
          order_number: number
          package_id: number
          required_documents: string[] | null
          source_stage_task_id: number | null
          stage_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          id?: string
          instructions?: string | null
          is_deleted?: boolean
          is_override?: boolean
          name: string
          order_number?: number
          package_id: number
          required_documents?: string[] | null
          source_stage_task_id?: number | null
          stage_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          id?: string
          instructions?: string | null
          is_deleted?: boolean
          is_override?: boolean
          name?: string
          order_number?: number
          package_id?: number
          required_documents?: string[] | null
          source_stage_task_id?: number | null
          stage_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_package_client_tasks_stage"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_hours: {
        Row: {
          client_id: string
          id: string
          minutes_included: number
          minutes_used: number
          package_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          id?: string
          minutes_included?: number
          minutes_used?: number
          package_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          id?: string
          minutes_included?: number
          minutes_used?: number
          package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_hours_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_hours_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      package_instances: {
        Row: {
          clo_id: number
          duration: number | null
          end_date: string | null
          hours_added: number | null
          hours_included: number | null
          hours_used: number | null
          id: number
          is_complete: boolean
          last_document_update_email: string | null
          manager_id: string | null
          package_id: number
          release_documents_office: boolean
          release_documents_pdf: boolean
          start_date: string
          tenant_id: number
          u1_packageid: number | null
          u2tid: number | null
        }
        Insert: {
          clo_id: number
          duration?: number | null
          end_date?: string | null
          hours_added?: number | null
          hours_included?: number | null
          hours_used?: number | null
          id?: number
          is_complete: boolean
          last_document_update_email?: string | null
          manager_id?: string | null
          package_id: number
          release_documents_office?: boolean
          release_documents_pdf?: boolean
          start_date: string
          tenant_id: number
          u1_packageid?: number | null
          u2tid?: number | null
        }
        Update: {
          clo_id?: number
          duration?: number | null
          end_date?: string | null
          hours_added?: number | null
          hours_included?: number | null
          hours_used?: number | null
          id?: number
          is_complete?: boolean
          last_document_update_email?: string | null
          manager_id?: string | null
          package_id?: number
          release_documents_office?: boolean
          release_documents_pdf?: boolean
          start_date?: string
          tenant_id?: number
          u1_packageid?: number | null
          u2tid?: number | null
        }
        Relationships: []
      }
      package_notes: {
        Row: {
          date_created: string
          id: number
          note: string
          package_instance_id: number
          staff_id: number
        }
        Insert: {
          date_created?: string
          id: number
          note: string
          package_instance_id: number
          staff_id: number
        }
        Update: {
          date_created?: string
          id?: number
          note?: string
          package_instance_id?: number
          staff_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_notes_package_instance_id_fkey"
            columns: ["package_instance_id"]
            isOneToOne: false
            referencedRelation: "package_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      package_staff_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date_offset: number | null
          estimated_hours: number | null
          id: string
          is_deleted: boolean
          is_mandatory: boolean | null
          is_override: boolean
          name: string
          order_number: number
          owner_role: string | null
          package_id: number
          source_stage_task_id: number | null
          stage_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          estimated_hours?: number | null
          id?: string
          is_deleted?: boolean
          is_mandatory?: boolean | null
          is_override?: boolean
          name: string
          order_number?: number
          owner_role?: string | null
          package_id: number
          source_stage_task_id?: number | null
          stage_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          estimated_hours?: number | null
          id?: string
          is_deleted?: boolean
          is_mandatory?: boolean | null
          is_override?: boolean
          name?: string
          order_number?: number
          owner_role?: string | null
          package_id?: number
          source_stage_task_id?: number | null
          stage_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_package_staff_tasks_stage"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_stage_documents: {
        Row: {
          created_at: string
          delivery_type: string
          document_id: number
          id: string
          is_deleted: boolean
          is_override: boolean
          package_id: number
          sort_order: number
          source_stage_document_id: number | null
          stage_id: number
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          delivery_type?: string
          document_id: number
          id?: string
          is_deleted?: boolean
          is_override?: boolean
          package_id: number
          sort_order?: number
          source_stage_document_id?: number | null
          stage_id: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          delivery_type?: string
          document_id?: number
          id?: string
          is_deleted?: boolean
          is_override?: boolean
          package_id?: number
          sort_order?: number
          source_stage_document_id?: number | null
          stage_id?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_stage_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "package_stage_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_stage_documents_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_stage_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email_template_id: string
          id: number
          is_active: boolean
          is_deleted: boolean
          is_override: boolean
          package_id: number
          recipient_type: string
          sort_order: number
          source_stage_email_id: number | null
          stage_id: number
          trigger_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_template_id: string
          id?: never
          is_active?: boolean
          is_deleted?: boolean
          is_override?: boolean
          package_id: number
          recipient_type?: string
          sort_order?: number
          source_stage_email_id?: number | null
          stage_id: number
          trigger_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_template_id?: string
          id?: never
          is_active?: boolean
          is_deleted?: boolean
          is_override?: boolean
          package_id?: number
          recipient_type?: string
          sort_order?: number
          source_stage_email_id?: number | null
          stage_id?: number
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_stage_emails_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_stage_emails_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_stage_map: {
        Row: {
          created_at: string
          dashboard_visible: boolean
          id: number
          is_required: boolean
          package_id: number
          sort_order: number
          stage_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_visible?: boolean
          id?: never
          is_required?: boolean
          package_id: number
          sort_order?: number
          stage_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_visible?: boolean
          id?: never
          is_required?: boolean
          package_id?: number
          sort_order?: number
          stage_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_stage_map_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_stages: {
        Row: {
          created_at: string
          created_by: string | null
          dashboard_group: string | null
          id: number
          is_required: boolean
          last_checked_at: string | null
          last_synced_at: string | null
          package_id: number
          sort_order: number
          stage_id: number
          stage_version_id: string | null
          update_policy: string
          use_overrides: boolean | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dashboard_group?: string | null
          id?: number
          is_required?: boolean
          last_checked_at?: string | null
          last_synced_at?: string | null
          package_id: number
          sort_order?: number
          stage_id: number
          stage_version_id?: string | null
          update_policy?: string
          use_overrides?: boolean | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dashboard_group?: string | null
          id?: number
          is_required?: boolean
          last_checked_at?: string | null
          last_synced_at?: string | null
          package_id?: number
          sort_order?: number
          stage_id?: number
          stage_version_id?: string | null
          update_policy?: string
          use_overrides?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "package_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_stages_stage_version_id_fkey"
            columns: ["stage_version_id"]
            isOneToOne: false
            referencedRelation: "stage_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      package_type_thresholds: {
        Row: {
          created_at: string
          hours_critical_pct: number
          hours_warn_pct: number
          no_activity_days: number
          package_type: string
          updated_at: string
          waiting_critical_days: number
          waiting_warn_days: number
        }
        Insert: {
          created_at?: string
          hours_critical_pct?: number
          hours_warn_pct?: number
          no_activity_days?: number
          package_type: string
          updated_at?: string
          waiting_critical_days?: number
          waiting_warn_days?: number
        }
        Update: {
          created_at?: string
          hours_critical_pct?: number
          hours_warn_pct?: number
          no_activity_days?: number
          package_type?: string
          updated_at?: string
          waiting_critical_days?: number
          waiting_warn_days?: number
        }
        Relationships: []
      }
      package_workflow_logs: {
        Row: {
          action: string
          created_at: string | null
          created_by: string | null
          details: Json | null
          id: string
          package_id: number
          tenant_id: number
        }
        Insert: {
          action: string
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          id?: string
          package_id: number
          tenant_id: number
        }
        Update: {
          action?: string
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          id?: string
          package_id?: number
          tenant_id?: number
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string | null
          details: string | null
          document_assurance_period: number | null
          duration_months: number | null
          full_text: string | null
          id: number
          import_id: number
          name: string | null
          package_type: string | null
          progress_mode: string | null
          slug: string | null
          status: string
          total_hours: number | null
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          document_assurance_period?: number | null
          duration_months?: number | null
          full_text?: string | null
          id: number
          import_id?: never
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string
          total_hours?: number | null
        }
        Update: {
          created_at?: string | null
          details?: string | null
          document_assurance_period?: number | null
          duration_months?: number | null
          full_text?: string | null
          id?: number
          import_id?: never
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string
          total_hours?: number | null
        }
        Relationships: []
      }
      people_analyzer_entries: {
        Row: {
          assessed_by: string
          core_value_id: string
          core_value_text: string
          created_at: string
          created_by: string | null
          id: string
          qc_id: string
          quarter_number: number
          quarter_year: number
          rating: string
          seat_id: string | null
          tenant_id: number
          user_id: string
        }
        Insert: {
          assessed_by: string
          core_value_id: string
          core_value_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          qc_id: string
          quarter_number: number
          quarter_year: number
          rating: string
          seat_id?: string | null
          tenant_id: number
          user_id: string
        }
        Update: {
          assessed_by?: string
          core_value_id?: string
          core_value_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          qc_id?: string
          quarter_number?: number
          quarter_year?: number
          rating?: string
          seat_id?: string | null
          tenant_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_analyzer_entries_qc_id_fkey"
            columns: ["qc_id"]
            isOneToOne: false
            referencedRelation: "eos_qc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_analyzer_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_analyzer_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "people_analyzer_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      people_analyzer_trends: {
        Row: {
          calculated_at: string
          consecutive_minus_count: number | null
          core_value_id: string
          core_value_text: string
          created_at: string
          has_divergence: boolean | null
          id: string
          is_at_risk: boolean | null
          manager_rating: string | null
          minus_rate: number
          period_end: string
          period_start: string
          plus_minus_rate: number
          plus_rate: number
          quarter_number: number
          quarter_year: number
          seat_id: string | null
          team_member_rating: string | null
          tenant_id: number
          trend: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calculated_at?: string
          consecutive_minus_count?: number | null
          core_value_id: string
          core_value_text: string
          created_at?: string
          has_divergence?: boolean | null
          id?: string
          is_at_risk?: boolean | null
          manager_rating?: string | null
          minus_rate?: number
          period_end: string
          period_start: string
          plus_minus_rate?: number
          plus_rate?: number
          quarter_number: number
          quarter_year: number
          seat_id?: string | null
          team_member_rating?: string | null
          tenant_id: number
          trend?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calculated_at?: string
          consecutive_minus_count?: number | null
          core_value_id?: string
          core_value_text?: string
          created_at?: string
          has_divergence?: boolean | null
          id?: string
          is_at_risk?: boolean | null
          manager_rating?: string | null
          minus_rate?: number
          period_end?: string
          period_start?: string
          plus_minus_rate?: number
          plus_rate?: number
          quarter_number?: number
          quarter_year?: number
          seat_id?: string | null
          team_member_rating?: string | null
          tenant_id?: number
          trend?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_analyzer_trends_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_analyzer_trends_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "people_analyzer_trends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      place_holders: {
        Row: {
          ID: number
          Value: string
        }
        Insert: {
          ID?: number
          Value: string
        }
        Update: {
          ID?: number
          Value?: string
        }
        Relationships: []
      }
      process_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          details: Json | null
          id: string
          occurred_at: string
          process_id: string
          reason: string | null
          tenant_id: number | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          details?: Json | null
          id?: string
          occurred_at?: string
          process_id: string
          reason?: string | null
          tenant_id?: number | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          details?: Json | null
          id?: string
          occurred_at?: string
          process_id?: string
          reason?: string | null
          tenant_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "process_audit_log_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tag_links: {
        Row: {
          created_at: string
          created_by: string
          process_id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          process_id: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          process_id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_tag_links_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "process_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      process_tags: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      process_versions: {
        Row: {
          applies_to: string
          applies_to_package_id: number | null
          approved_at: string | null
          approved_by: string | null
          category: string
          content: Json | null
          created_at: string
          created_by: string
          edit_reason: string | null
          evidence_records: string | null
          id: string
          instructions: string | null
          owner_user_id: string | null
          process_id: string
          purpose: string | null
          related_standards: string | null
          review_date: string | null
          reviewer_user_id: string | null
          scope: string | null
          short_description: string | null
          snapshot_data: Json | null
          status: string
          tags: string[] | null
          title: string
          version: number
        }
        Insert: {
          applies_to: string
          applies_to_package_id?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category: string
          content?: Json | null
          created_at?: string
          created_by: string
          edit_reason?: string | null
          evidence_records?: string | null
          id?: string
          instructions?: string | null
          owner_user_id?: string | null
          process_id: string
          purpose?: string | null
          related_standards?: string | null
          review_date?: string | null
          reviewer_user_id?: string | null
          scope?: string | null
          short_description?: string | null
          snapshot_data?: Json | null
          status: string
          tags?: string[] | null
          title: string
          version: number
        }
        Update: {
          applies_to?: string
          applies_to_package_id?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          content?: Json | null
          created_at?: string
          created_by?: string
          edit_reason?: string | null
          evidence_records?: string | null
          id?: string
          instructions?: string | null
          owner_user_id?: string | null
          process_id?: string
          purpose?: string | null
          related_standards?: string | null
          review_date?: string | null
          reviewer_user_id?: string | null
          scope?: string | null
          short_description?: string | null
          snapshot_data?: Json | null
          status?: string
          tags?: string[] | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "process_versions_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          applies_to: string
          applies_to_package_id: number | null
          approved_at: string | null
          approved_by: string | null
          category: string
          content: Json | null
          created_at: string
          created_by: string
          edit_reason: string | null
          evidence_records: string | null
          id: string
          instructions: string | null
          owner_user_id: string | null
          purpose: string | null
          related_standards: string | null
          review_date: string | null
          reviewer_user_id: string | null
          scope: string | null
          short_description: string | null
          status: string
          tags: string[] | null
          tenant_id: number | null
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          applies_to?: string
          applies_to_package_id?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category: string
          content?: Json | null
          created_at?: string
          created_by: string
          edit_reason?: string | null
          evidence_records?: string | null
          id?: string
          instructions?: string | null
          owner_user_id?: string | null
          purpose?: string | null
          related_standards?: string | null
          review_date?: string | null
          reviewer_user_id?: string | null
          scope?: string | null
          short_description?: string | null
          status?: string
          tags?: string[] | null
          tenant_id?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          applies_to?: string
          applies_to_package_id?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          content?: Json | null
          created_at?: string
          created_by?: string
          edit_reason?: string | null
          evidence_records?: string | null
          id?: string
          instructions?: string | null
          owner_user_id?: string | null
          purpose?: string | null
          related_standards?: string | null
          review_date?: string | null
          reviewer_user_id?: string | null
          scope?: string | null
          short_description?: string | null
          status?: string
          tags?: string[] | null
          tenant_id?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          auth_user_id: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          global_role: string | null
          id: number
          role: string | null
          updated_at: string | null
          user_id: string
          userid: number | null
          username: string
        }
        Insert: {
          active_tenant_id?: string | null
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          global_role?: string | null
          id?: number
          role?: string | null
          updated_at?: string | null
          user_id: string
          userid?: number | null
          username: string
        }
        Update: {
          active_tenant_id?: string | null
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          global_role?: string | null
          id?: number
          role?: string | null
          updated_at?: string | null
          user_id?: string
          userid?: number | null
          username?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          description: string | null
          framework: string | null
          id: string
          name: string
          package_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          description?: string | null
          framework?: string | null
          id?: string
          name: string
          package_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          framework?: string | null
          id?: string
          name?: string
          package_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      qualification_cache: {
        Row: {
          data: Json
          id: number
          last_updated: string | null
          qualification_code: string
          rto_id: string
        }
        Insert: {
          data: Json
          id?: number
          last_updated?: string | null
          qualification_code: string
          rto_id: string
        }
        Update: {
          data?: Json
          id?: number
          last_updated?: string | null
          qualification_code?: string
          rto_id?: string
        }
        Relationships: []
      }
      rate_limit_tracker: {
        Row: {
          action_type: string
          count: number
          created_at: string
          id: string
          tenant_id: number
          window_start: string
        }
        Insert: {
          action_type: string
          count?: number
          created_at?: string
          id?: string
          tenant_id: number
          window_start?: string
        }
        Update: {
          action_type?: string
          count?: number
          created_at?: string
          id?: string
          tenant_id?: number
          window_start?: string
        }
        Relationships: []
      }
      resource_favourites: {
        Row: {
          created_at: string | null
          id: string
          resource_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          resource_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          resource_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_favourites_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resource_library"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_library: {
        Row: {
          access_level: string | null
          category: string
          created_at: string | null
          description: string | null
          file_url: string | null
          id: string
          tags: string[] | null
          title: string
          updated_at: string | null
          version: string | null
          video_url: string | null
        }
        Insert: {
          access_level?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          version?: string | null
          video_url?: string | null
        }
        Update: {
          access_level?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          version?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      resource_usage: {
        Row: {
          downloaded: boolean | null
          id: string
          resource_id: string | null
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          downloaded?: boolean | null
          id?: string
          resource_id?: string | null
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          downloaded?: boolean | null
          id?: string
          resource_id?: string | null
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_usage_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resource_library"
            referencedColumns: ["id"]
          },
        ]
      }
      reusable_audit_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          is_global: boolean
          name: string
          options: Json
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          is_global?: boolean
          name: string
          options?: Json
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          is_global?: boolean
          name?: string
          options?: Json
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      risk_flags: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string
          flag_id: string
          severity: string
          type: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description: string
          flag_id?: string
          severity: string
          type?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string
          flag_id?: string
          severity?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      rto_cache: {
        Row: {
          data: Json
          id: number
          last_updated: string | null
          rto_id: string
        }
        Insert: {
          data: Json
          id?: number
          last_updated?: string | null
          rto_id: string
        }
        Update: {
          data?: Json
          id?: number
          last_updated?: string | null
          rto_id?: string
        }
        Relationships: []
      }
      rto_tips: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          details: string
          id: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          details: string
          id?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          details?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rto_tips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      sch_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          details: Json | null
          entity: string
          entity_id: string
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          details?: Json | null
          entity: string
          entity_id: string
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          details?: Json | null
          entity?: string
          entity_id?: string
          id?: string
          org_id?: string
        }
        Relationships: []
      }
      sch_away_blocks: {
        Row: {
          champion_id: string
          created_at: string | null
          ends_at: string
          id: string
          reason: string | null
          starts_at: string
        }
        Insert: {
          champion_id: string
          created_at?: string | null
          ends_at: string
          id?: string
          reason?: string | null
          starts_at: string
        }
        Update: {
          champion_id?: string
          created_at?: string | null
          ends_at?: string
          id?: string
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sch_away_blocks_champion_id_fkey"
            columns: ["champion_id"]
            isOneToOne: false
            referencedRelation: "sch_champion"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_bookings: {
        Row: {
          champion_id: string
          champion_notes: string | null
          client_id: string
          client_notes: string | null
          counts_toward_consult_hours: boolean
          created_at: string | null
          created_by: string
          ends_at: string
          ext_event_id: string | null
          ext_meet_url: string | null
          id: string
          meeting_type_id: string
          org_id: string
          starts_at: string
          status: Database["public"]["Enums"]["sch_booking_status"]
          updated_at: string | null
        }
        Insert: {
          champion_id: string
          champion_notes?: string | null
          client_id: string
          client_notes?: string | null
          counts_toward_consult_hours?: boolean
          created_at?: string | null
          created_by: string
          ends_at: string
          ext_event_id?: string | null
          ext_meet_url?: string | null
          id?: string
          meeting_type_id: string
          org_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["sch_booking_status"]
          updated_at?: string | null
        }
        Update: {
          champion_id?: string
          champion_notes?: string | null
          client_id?: string
          client_notes?: string | null
          counts_toward_consult_hours?: boolean
          created_at?: string | null
          created_by?: string
          ends_at?: string
          ext_event_id?: string | null
          ext_meet_url?: string | null
          id?: string
          meeting_type_id?: string
          org_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["sch_booking_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sch_bookings_champion_id_fkey"
            columns: ["champion_id"]
            isOneToOne: false
            referencedRelation: "sch_champion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sch_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sch_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sch_bookings_meeting_type_id_fkey"
            columns: ["meeting_type_id"]
            isOneToOne: false
            referencedRelation: "sch_meeting_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_calendar_credentials: {
        Row: {
          access_token: string
          champion_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          scope: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          champion_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          champion_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sch_calendar_credentials_champion_id_fkey"
            columns: ["champion_id"]
            isOneToOne: false
            referencedRelation: "sch_champion"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_champion: {
        Row: {
          cal_provider: string | null
          created_at: string | null
          id: string
          org_id: string
          phone: string | null
          photo_url: string | null
          primary_calendar_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          working_tz: string
        }
        Insert: {
          cal_provider?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          phone?: string | null
          photo_url?: string | null
          primary_calendar_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          working_tz?: string
        }
        Update: {
          cal_provider?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          primary_calendar_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          working_tz?: string
        }
        Relationships: []
      }
      sch_meeting_types: {
        Row: {
          allow_client_cancel: boolean
          allow_client_reschedule: boolean
          champion_id: string
          created_at: string | null
          duration_mins: number
          id: string
          max_ahead_days: number
          min_notice_hours: number
          name: string
          org_id: string
        }
        Insert: {
          allow_client_cancel?: boolean
          allow_client_reschedule?: boolean
          champion_id: string
          created_at?: string | null
          duration_mins: number
          id?: string
          max_ahead_days?: number
          min_notice_hours?: number
          name: string
          org_id: string
        }
        Update: {
          allow_client_cancel?: boolean
          allow_client_reschedule?: boolean
          champion_id?: string
          created_at?: string | null
          duration_mins?: number
          id?: string
          max_ahead_days?: number
          min_notice_hours?: number
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sch_meeting_types_champion_id_fkey"
            columns: ["champion_id"]
            isOneToOne: false
            referencedRelation: "sch_champion"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_working_hours: {
        Row: {
          buffer_after_mins: number
          buffer_before_mins: number
          champion_id: string
          created_at: string | null
          end_time: string
          id: string
          start_time: string
          weekday: number
        }
        Insert: {
          buffer_after_mins?: number
          buffer_before_mins?: number
          champion_id: string
          created_at?: string | null
          end_time: string
          id?: string
          start_time: string
          weekday: number
        }
        Update: {
          buffer_after_mins?: number
          buffer_before_mins?: number
          champion_id?: string
          created_at?: string | null
          end_time?: string
          id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "sch_working_hours_champion_id_fkey"
            columns: ["champion_id"]
            isOneToOne: false
            referencedRelation: "sch_champion"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_health_scores: {
        Row: {
          cadence_score: number
          calculated_at: string
          contributing_factors: Json
          created_at: string
          gwc_score: number
          health_band: string
          id: string
          ids_score: number
          quarter_number: number
          quarter_year: number
          rocks_score: number
          seat_id: string
          tenant_id: number
          todos_score: number
          total_score: number
          updated_at: string
        }
        Insert: {
          cadence_score?: number
          calculated_at?: string
          contributing_factors?: Json
          created_at?: string
          gwc_score?: number
          health_band?: string
          id?: string
          ids_score?: number
          quarter_number: number
          quarter_year: number
          rocks_score?: number
          seat_id: string
          tenant_id: number
          todos_score?: number
          total_score?: number
          updated_at?: string
        }
        Update: {
          cadence_score?: number
          calculated_at?: string
          contributing_factors?: Json
          created_at?: string
          gwc_score?: number
          health_band?: string
          id?: string
          ids_score?: number
          quarter_number?: number
          quarter_year?: number
          rocks_score?: number
          seat_id?: string
          tenant_id?: number
          todos_score?: number
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_health_scores_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_health_scores_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "seat_health_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_measurable_entries: {
        Row: {
          actual_value: number
          comparison_type_stored: string
          entered_at: string
          entered_by: string
          id: string
          notes: string | null
          seat_measurable_id: string
          status: string
          target_value_stored: number
          tenant_id: number
          week_start_date: string
        }
        Insert: {
          actual_value: number
          comparison_type_stored: string
          entered_at?: string
          entered_by: string
          id?: string
          notes?: string | null
          seat_measurable_id: string
          status?: string
          target_value_stored: number
          tenant_id: number
          week_start_date: string
        }
        Update: {
          actual_value?: number
          comparison_type_stored?: string
          entered_at?: string
          entered_by?: string
          id?: string
          notes?: string | null
          seat_measurable_id?: string
          status?: string
          target_value_stored?: number
          tenant_id?: number
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_measurable_entries_seat_measurable_id_fkey"
            columns: ["seat_measurable_id"]
            isOneToOne: false
            referencedRelation: "seat_measurables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_measurable_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_measurables: {
        Row: {
          comparison_type: string
          created_at: string
          frequency: string
          id: string
          is_active: boolean
          name: string
          seat_scorecard_id: string
          sort_order: number
          target_value: number
          tenant_id: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          comparison_type?: string
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          seat_scorecard_id: string
          sort_order?: number
          target_value: number
          tenant_id: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          comparison_type?: string
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          seat_scorecard_id?: string
          sort_order?: number
          target_value?: number
          tenant_id?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_measurables_seat_scorecard_id_fkey"
            columns: ["seat_scorecard_id"]
            isOneToOne: false
            referencedRelation: "seat_scorecards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_measurables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_meeting_requirements: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          meeting_type: string
          seat_id: string
          tenant_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          meeting_type: string
          seat_id: string
          tenant_id: number
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          meeting_type?: string
          seat_id?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "seat_meeting_requirements_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_meeting_requirements_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "seat_meeting_requirements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_rebalancing_recommendations: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          description: string
          dismissed_at: string | null
          dismissed_by: string | null
          dismissed_reason: string | null
          id: string
          quarter_number: number
          quarter_year: number
          recommendation_type: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          seat_id: string
          severity: string
          status: string
          suggested_rocks: Json | null
          suggested_seats: Json | null
          suggested_users: Json | null
          tenant_id: number
          title: string
          trigger_details: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          description: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          dismissed_reason?: string | null
          id?: string
          quarter_number: number
          quarter_year: number
          recommendation_type: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seat_id: string
          severity?: string
          status?: string
          suggested_rocks?: Json | null
          suggested_seats?: Json | null
          suggested_users?: Json | null
          tenant_id: number
          title: string
          trigger_details?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          description?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          dismissed_reason?: string | null
          id?: string
          quarter_number?: number
          quarter_year?: number
          recommendation_type?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seat_id?: string
          severity?: string
          status?: string
          suggested_rocks?: Json | null
          suggested_seats?: Json | null
          suggested_users?: Json | null
          tenant_id?: number
          title?: string
          trigger_details?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_rebalancing_recommendations_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_rebalancing_recommendations_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "seat_rebalancing_recommendations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_scorecard_versions: {
        Row: {
          change_summary: string
          created_at: string
          created_by: string
          id: string
          seat_scorecard_id: string
          tenant_id: number
          version_number: number
        }
        Insert: {
          change_summary: string
          created_at?: string
          created_by: string
          id?: string
          seat_scorecard_id: string
          tenant_id: number
          version_number?: number
        }
        Update: {
          change_summary?: string
          created_at?: string
          created_by?: string
          id?: string
          seat_scorecard_id?: string
          tenant_id?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "seat_scorecard_versions_seat_scorecard_id_fkey"
            columns: ["seat_scorecard_id"]
            isOneToOne: false
            referencedRelation: "seat_scorecards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_scorecard_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_scorecards: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          seat_id: string
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id?: string
          seat_id: string
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          seat_id?: string
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_scorecards_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: true
            referencedRelation: "accountability_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_scorecards_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: true
            referencedRelation: "seat_linked_data"
            referencedColumns: ["seat_id"]
          },
          {
            foreignKeyName: "seat_scorecards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      skillset_cache: {
        Row: {
          data: Json
          id: number
          last_updated: string | null
          rto_id: string
          skillset_code: string
        }
        Insert: {
          data: Json
          id?: number
          last_updated?: string | null
          rto_id: string
          skillset_code: string
        }
        Update: {
          data?: Json
          id?: number
          last_updated?: string | null
          rto_id?: string
          skillset_code?: string
        }
        Relationships: []
      }
      staff_task_instances: {
        Row: {
          assigned_date: string | null
          assignee_id: string | null
          completion_date: string | null
          created_at: string | null
          due_date: string | null
          id: number
          notes: string | null
          stafftask_id: number
          stageinstance_id: number
          status: string
          status_id: number
          u1_assignee_id: number | null
          u1_id: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_date?: string | null
          assignee_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          due_date?: string | null
          id: number
          notes?: string | null
          stafftask_id: number
          stageinstance_id: number
          status?: string
          status_id?: number
          u1_assignee_id?: number | null
          u1_id?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_date?: string | null
          assignee_id?: string | null
          completion_date?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: number
          notes?: string | null
          stafftask_id?: number
          stageinstance_id?: number
          status?: string
          status_id?: number
          u1_assignee_id?: number | null
          u1_id?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      staff_tasks: {
        Row: {
          description: string | null
          due_date_offset: number | null
          id: number
          name: string | null
          order_number: number
          stage_id: number | null
        }
        Insert: {
          description?: string | null
          due_date_offset?: number | null
          id?: number
          name?: string | null
          order_number: number
          stage_id?: number | null
        }
        Update: {
          description?: string | null
          due_date_offset?: number | null
          id?: number
          name?: string | null
          order_number?: number
          stage_id?: number | null
        }
        Relationships: []
      }
      stage_client_tasks: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date_offset: number | null
          id: number
          instructions: string | null
          is_mandatory: boolean | null
          name: string
          required_documents: string[] | null
          sort_order: number
          stage_id: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date_offset?: number | null
          id?: never
          instructions?: string | null
          is_mandatory?: boolean | null
          name: string
          required_documents?: string[] | null
          sort_order?: number
          stage_id: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date_offset?: number | null
          id?: never
          instructions?: string | null
          is_mandatory?: boolean | null
          name?: string
          required_documents?: string[] | null
          sort_order?: number
          stage_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage_client_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_documents: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_type: string
          document_id: number
          id: number
          is_auto_generated: boolean | null
          is_required: boolean
          is_team_only: boolean | null
          is_tenant_downloadable: boolean | null
          is_tenant_visible: boolean
          notes: string | null
          pinned_version_id: string | null
          sort_order: number
          stage_id: number
          visibility: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_type?: string
          document_id: number
          id?: never
          is_auto_generated?: boolean | null
          is_required?: boolean
          is_team_only?: boolean | null
          is_tenant_downloadable?: boolean | null
          is_tenant_visible?: boolean
          notes?: string | null
          pinned_version_id?: string | null
          sort_order?: number
          stage_id: number
          visibility?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_type?: string
          document_id?: number
          id?: never
          is_auto_generated?: boolean | null
          is_required?: boolean
          is_team_only?: boolean | null
          is_tenant_downloadable?: boolean | null
          is_tenant_visible?: boolean
          notes?: string | null
          pinned_version_id?: string | null
          sort_order?: number
          stage_id?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "stage_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_documents_pinned_version_id_fkey"
            columns: ["pinned_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_documents_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_emails: {
        Row: {
          created_at: string | null
          created_by: string | null
          email_template_id: string
          id: number
          is_active: boolean
          recipient_type: string
          sort_order: number
          stage_id: number
          trigger_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email_template_id: string
          id?: never
          is_active?: boolean
          recipient_type?: string
          sort_order?: number
          stage_id: number
          trigger_type?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email_template_id?: string
          id?: never
          is_active?: boolean
          recipient_type?: string
          sort_order?: number
          stage_id?: number
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_emails_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_emails_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_instances: {
        Row: {
          comment: string | null
          completion_date: string | null
          id: number
          packageinstance_id: number
          paid: boolean
          released_client_tasks: boolean
          released_client_tasks_date: string | null
          stage_id: number
          stage_sortorder: number | null
          status: string | null
          status_date: string | null
          status_id: number | null
        }
        Insert: {
          comment?: string | null
          completion_date?: string | null
          id?: number
          packageinstance_id: number
          paid?: boolean
          released_client_tasks?: boolean
          released_client_tasks_date?: string | null
          stage_id: number
          stage_sortorder?: number | null
          status?: string | null
          status_date?: string | null
          status_id?: number | null
        }
        Update: {
          comment?: string | null
          completion_date?: string | null
          id?: number
          packageinstance_id?: number
          paid?: boolean
          released_client_tasks?: boolean
          released_client_tasks_date?: string | null
          stage_id?: number
          stage_sortorder?: number | null
          status?: string | null
          status_date?: string | null
          status_id?: number | null
        }
        Relationships: []
      }
      stage_release_items: {
        Row: {
          created_at: string
          document_id: number
          document_version_id: string | null
          generated_document_id: string | null
          generation_status: string | null
          id: string
          include_in_pack: boolean
          is_visible_to_tenant: boolean
          stage_release_id: string
        }
        Insert: {
          created_at?: string
          document_id: number
          document_version_id?: string | null
          generated_document_id?: string | null
          generation_status?: string | null
          id?: string
          include_in_pack?: boolean
          is_visible_to_tenant?: boolean
          stage_release_id: string
        }
        Update: {
          created_at?: string
          document_id?: number
          document_version_id?: string | null
          generated_document_id?: string | null
          generation_status?: string | null
          id?: string
          include_in_pack?: boolean
          is_visible_to_tenant?: boolean
          stage_release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_release_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "stage_release_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_release_items_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_release_items_generated_document_id_fkey"
            columns: ["generated_document_id"]
            isOneToOne: false
            referencedRelation: "generated_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_release_items_stage_release_id_fkey"
            columns: ["stage_release_id"]
            isOneToOne: false
            referencedRelation: "stage_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_release_reviews: {
        Row: {
          checklist: Json | null
          completed_at: string | null
          id: string
          notes: string | null
          requested_at: string
          requested_by: string | null
          reviewer_user_id: string
          stage_release_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          checklist?: Json | null
          completed_at?: string | null
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string | null
          reviewer_user_id: string
          stage_release_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          checklist?: Json | null
          completed_at?: string | null
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string | null
          reviewer_user_id?: string
          stage_release_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_release_reviews_stage_release_id_fkey"
            columns: ["stage_release_id"]
            isOneToOne: false
            referencedRelation: "stage_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_releases: {
        Row: {
          created_at: string
          created_by: string | null
          email_sent_at: string | null
          email_template_id: string | null
          id: string
          pack_download_url: string | null
          package_id: number | null
          release_type: string
          released_at: string | null
          released_by: string | null
          stage_id: number
          status: string
          summary: string | null
          tenant_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_sent_at?: string | null
          email_template_id?: string | null
          id?: string
          pack_download_url?: string | null
          package_id?: number | null
          release_type?: string
          released_at?: string | null
          released_by?: string | null
          stage_id: number
          status?: string
          summary?: string | null
          tenant_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_sent_at?: string | null
          email_template_id?: string | null
          id?: string
          pack_download_url?: string | null
          package_id?: number | null
          release_type?: string
          released_at?: string | null
          released_by?: string | null
          stage_id?: number
          status?: string
          summary?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage_releases_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_releases_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_state_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_status: string
          old_status: string | null
          reason: string | null
          stage_state_id: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_status: string
          old_status?: string | null
          reason?: string | null
          stage_state_id: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_status?: string
          old_status?: string | null
          reason?: string | null
          stage_state_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage_state_audit_log_stage_state_id_fkey"
            columns: ["stage_state_id"]
            isOneToOne: false
            referencedRelation: "client_package_stage_state"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_task_templates: {
        Row: {
          created_at: string | null
          description: string | null
          due_date_offset: number | null
          estimated_hours: number | null
          id: string
          instructions: string | null
          is_mandatory: boolean | null
          name: string
          order_number: number
          owner_role: string | null
          required_documents: string[] | null
          stage_id: number | null
          task_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date_offset?: number | null
          estimated_hours?: number | null
          id?: string
          instructions?: string | null
          is_mandatory?: boolean | null
          name: string
          order_number?: number
          owner_role?: string | null
          required_documents?: string[] | null
          stage_id?: number | null
          task_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date_offset?: number | null
          estimated_hours?: number | null
          id?: string
          instructions?: string | null
          is_mandatory?: boolean | null
          name?: string
          order_number?: number
          owner_role?: string | null
          required_documents?: string[] | null
          stage_id?: number | null
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_task_templates_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_team_tasks: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          estimated_hours: number | null
          id: number
          is_mandatory: boolean | null
          name: string
          owner_role: string | null
          sort_order: number
          stage_id: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: never
          is_mandatory?: boolean | null
          name: string
          owner_role?: string | null
          sort_order?: number
          stage_id: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: never
          is_mandatory?: boolean | null
          name?: string
          owner_role?: string | null
          sort_order?: number
          stage_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage_team_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          snapshot: Json
          stage_id: number
          status: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          snapshot: Json
          stage_id: number
          status?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          snapshot?: Json
          stage_id?: number
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage_versions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          dateimported: string
          description: string | null
          id: number
          name: string
          shortname: string | null
          videourl: string | null
        }
        Insert: {
          dateimported?: string
          description?: string | null
          id: number
          name: string
          shortname?: string | null
          videourl?: string | null
        }
        Update: {
          dateimported?: string
          description?: string | null
          id?: number
          name?: string
          shortname?: string | null
          videourl?: string | null
        }
        Relationships: []
      }
      standards_reference: {
        Row: {
          code: string
          created_at: string | null
          framework: string
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          framework: string
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          framework?: string
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_emails: {
        Row: {
          body_template: string
          created_at: string | null
          id: string
          is_active: boolean
          key: string
          merge_fields: Json
          name: string
          subject_template: string
          updated_at: string | null
        }
        Insert: {
          body_template: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          key: string
          merge_fields?: Json
          name: string
          subject_template: string
          updated_at?: string | null
        }
        Update: {
          body_template?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          key?: string
          merge_fields?: Json
          name?: string
          subject_template?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_reference_lists: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          list_key: string
          updated_at: string
          values: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          list_key: string
          updated_at?: string
          values?: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          list_key?: string
          updated_at?: string
          values?: string[]
        }
        Relationships: []
      }
      task_evidence: {
        Row: {
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          notes: string | null
          task_id: string
          tenant_id: number
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          notes?: string | null
          task_id: string
          tenant_id: number
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          notes?: string | null
          task_id?: string
          tenant_id?: number
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_statuses: {
        Row: {
          code: string
          order_index: number
        }
        Insert: {
          code: string
          order_index: number
        }
        Update: {
          code?: string
          order_index?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_comments: Json | null
          assignees: Json | null
          attachments: Json | null
          checklists: Json | null
          comments: Json | null
          date_created_at: string | null
          date_created_ms: number | null
          date_created_text: string | null
          due_date_at: string | null
          due_date_ms: number | null
          due_date_text: string | null
          folder_name_path: string | null
          id: string
          inserted_at: string
          list_name: string | null
          parent_id: string | null
          priority: string | null
          space_name: string | null
          start_date_at: string | null
          start_date_ms: number | null
          start_date_text: string | null
          status: string | null
          tags: Json | null
          task_content: string | null
          task_custom_id: string | null
          task_id: string | null
          task_name: string | null
          time_estimated_ms: number | null
          time_estimated_text: string | null
          time_spent_ms: number | null
          time_spent_text: string | null
          updated_at: string
        }
        Insert: {
          assigned_comments?: Json | null
          assignees?: Json | null
          attachments?: Json | null
          checklists?: Json | null
          comments?: Json | null
          date_created_at?: string | null
          date_created_ms?: number | null
          date_created_text?: string | null
          due_date_at?: string | null
          due_date_ms?: number | null
          due_date_text?: string | null
          folder_name_path?: string | null
          id?: string
          inserted_at?: string
          list_name?: string | null
          parent_id?: string | null
          priority?: string | null
          space_name?: string | null
          start_date_at?: string | null
          start_date_ms?: number | null
          start_date_text?: string | null
          status?: string | null
          tags?: Json | null
          task_content?: string | null
          task_custom_id?: string | null
          task_id?: string | null
          task_name?: string | null
          time_estimated_ms?: number | null
          time_estimated_text?: string | null
          time_spent_ms?: number | null
          time_spent_text?: string | null
          updated_at?: string
        }
        Update: {
          assigned_comments?: Json | null
          assignees?: Json | null
          attachments?: Json | null
          checklists?: Json | null
          comments?: Json | null
          date_created_at?: string | null
          date_created_ms?: number | null
          date_created_text?: string | null
          due_date_at?: string | null
          due_date_ms?: number | null
          due_date_text?: string | null
          folder_name_path?: string | null
          id?: string
          inserted_at?: string
          list_name?: string | null
          parent_id?: string | null
          priority?: string | null
          space_name?: string | null
          start_date_at?: string | null
          start_date_ms?: number | null
          start_date_text?: string | null
          status?: string | null
          tags?: Json | null
          task_content?: string | null
          task_custom_id?: string | null
          task_id?: string | null
          task_name?: string | null
          time_estimated_ms?: number | null
          time_estimated_text?: string | null
          time_spent_ms?: number | null
          time_spent_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks_tenants: {
        Row: {
          completed: boolean
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          escalated_at: string | null
          file_paths: string[] | null
          followers: string[] | null
          id: string
          last_reminder_at: string | null
          package_id: number | null
          reminder_count: number | null
          source_task_id: string | null
          stage_id: number | null
          stage_order: number | null
          status: string
          task_name: string
          task_type: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          escalated_at?: string | null
          file_paths?: string[] | null
          followers?: string[] | null
          id?: string
          last_reminder_at?: string | null
          package_id?: number | null
          reminder_count?: number | null
          source_task_id?: string | null
          stage_id?: number | null
          stage_order?: number | null
          status?: string
          task_name: string
          task_type?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          escalated_at?: string | null
          file_paths?: string[] | null
          followers?: string[] | null
          id?: string
          last_reminder_at?: string | null
          package_id?: number | null
          reminder_count?: number | null
          source_task_id?: string | null
          stage_id?: number | null
          stage_order?: number | null
          status?: string
          task_name?: string
          task_type?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenants_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      team_leader_assignments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          leader_user_uuid: string
          member_user_uuid: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          leader_user_uuid: string
          member_user_uuid: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          leader_user_uuid?: string
          member_user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_leader_assignments_leader_user_uuid_fkey"
            columns: ["leader_user_uuid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "team_leader_assignments_member_user_uuid_fkey"
            columns: ["member_user_uuid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      tenant_addresses: {
        Row: {
          address_type: string
          address1: string
          address2: string | null
          address3: string | null
          country: string
          country_code: string
          created_at: string
          created_by: string | null
          full_address: string | null
          geohash: string | null
          id: string
          inactive: boolean | null
          latitude: number | null
          legacy_userid: number | null
          longitude: number | null
          notes: string | null
          postcode: string | null
          state: string | null
          suburb: string | null
          tenant_id: number | null
          tenant_uuid: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_type: string
          address1: string
          address2?: string | null
          address3?: string | null
          country?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          full_address?: string | null
          geohash?: string | null
          id?: string
          inactive?: boolean | null
          latitude?: number | null
          legacy_userid?: number | null
          longitude?: number | null
          notes?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number | null
          tenant_uuid?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_type?: string
          address1?: string
          address2?: string | null
          address3?: string | null
          country?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          full_address?: string | null
          geohash?: string | null
          id?: string
          inactive?: boolean | null
          latitude?: number | null
          legacy_userid?: number | null
          longitude?: number | null
          notes?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number | null
          tenant_uuid?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addresses_address_type_fkey"
            columns: ["address_type"]
            isOneToOne: false
            referencedRelation: "dd_address_type"
            referencedColumns: ["code"]
          },
        ]
      }
      tenant_csc_assignments: {
        Row: {
          assigned_since: string
          created_at: string
          csc_user_id: string
          id: number
          is_primary: boolean
          role_label: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          assigned_since?: string
          created_at?: string
          csc_user_id: string
          id?: number
          is_primary?: boolean
          role_label?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          assigned_since?: string
          created_at?: string
          csc_user_id?: string
          id?: number
          is_primary?: boolean
          role_label?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_csc_assignments_csc_user_id_fkey"
            columns: ["csc_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      tenant_document_releases: {
        Row: {
          acknowledged_at: string | null
          document_id: number
          document_version_id: string
          downloaded_at: string | null
          id: string
          is_visible_to_tenant: boolean
          package_id: number | null
          released_at: string
          released_by: string | null
          stage_id: number | null
          tenant_id: number
        }
        Insert: {
          acknowledged_at?: string | null
          document_id: number
          document_version_id: string
          downloaded_at?: string | null
          id?: string
          is_visible_to_tenant?: boolean
          package_id?: number | null
          released_at?: string
          released_by?: string | null
          stage_id?: number | null
          tenant_id: number
        }
        Update: {
          acknowledged_at?: string | null
          document_id?: number
          document_version_id?: string
          downloaded_at?: string | null
          id?: string
          is_visible_to_tenant?: boolean
          package_id?: number | null
          released_at?: string
          released_by?: string | null
          stage_id?: number | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_document_releases_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_stage_usage"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "tenant_document_releases_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_document_releases_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_document_releases_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          role: string
          status: string
          tenant_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          tenant_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          tenant_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_user_id_users_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
        ]
      }
      tenant_merge_data: {
        Row: {
          created_at: string
          data: Json
          id: string
          tenant_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tenant_notes: {
        Row: {
          assignees: string[] | null
          completed_date: string | null
          created_at: string
          created_by: string
          duration: number | null
          file_names: string[] | null
          id: string
          note_details: string
          note_type: string | null
          package_id: number | null
          parent_type: string | null
          parent_uuid: string | null
          priority: string | null
          started_date: string | null
          tenant_id: number
          updated_at: string
          uploaded_files: string[] | null
        }
        Insert: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          duration?: number | null
          file_names?: string[] | null
          id?: string
          note_details: string
          note_type?: string | null
          package_id?: number | null
          parent_type?: string | null
          parent_uuid?: string | null
          priority?: string | null
          started_date?: string | null
          tenant_id: number
          updated_at?: string
          uploaded_files?: string[] | null
        }
        Update: {
          assignees?: string[] | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          duration?: number | null
          file_names?: string[] | null
          id?: string
          note_details?: string
          note_type?: string | null
          package_id?: number | null
          parent_type?: string | null
          parent_uuid?: string | null
          priority?: string | null
          started_date?: string | null
          tenant_id?: number
          updated_at?: string
          uploaded_files?: string[] | null
        }
        Relationships: []
      }
      tenant_profile: {
        Row: {
          abn: string | null
          acn: string | null
          address_line_1: string | null
          address_line_2: string | null
          created_at: string | null
          cricos_number: string | null
          legal_name: string | null
          notes: string | null
          org_type: string | null
          postcode: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          rto_number: string | null
          state: string | null
          suburb: string | null
          tenant_id: number
          trading_name: string | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          abn?: string | null
          acn?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          created_at?: string | null
          cricos_number?: string | null
          legal_name?: string | null
          notes?: string | null
          org_type?: string | null
          postcode?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          rto_number?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id: number
          trading_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          abn?: string | null
          acn?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          created_at?: string | null
          cricos_number?: string | null
          legal_name?: string | null
          notes?: string | null
          org_type?: string | null
          postcode?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          rto_number?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number
          trading_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      tenant_registry_links: {
        Row: {
          created_at: string | null
          external_id: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          link_status: string
          registry: string
          tenant_id: number
          updated_at: string | null
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          link_status?: string
          registry: string
          tenant_id: number
          updated_at?: string | null
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          link_status?: string
          registry?: string
          tenant_id?: number
          updated_at?: string | null
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      tenant_rto_scope: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_superseded: boolean | null
          last_refreshed_at: string | null
          scope_type: string
          status: string | null
          superseded_by: string | null
          tenant_id: number
          tga_data: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_superseded?: boolean | null
          last_refreshed_at?: string | null
          scope_type: string
          status?: string | null
          superseded_by?: string | null
          tenant_id: number
          tga_data?: Json | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_superseded?: boolean | null
          last_refreshed_at?: string | null
          scope_type?: string
          status?: string | null
          superseded_by?: string | null
          tenant_id?: number
          tga_data?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_stages: {
        Row: {
          client_tasks: Json | null
          created_at: string
          documents: Json | null
          id: string
          notes: string | null
          package_id: number | null
          staff_tasks: Json | null
          stage_id: number
          status: string | null
          tenant_id: number
          updated_at: string
        }
        Insert: {
          client_tasks?: Json | null
          created_at?: string
          documents?: Json | null
          id?: string
          notes?: string | null
          package_id?: number | null
          staff_tasks?: Json | null
          stage_id: number
          status?: string | null
          tenant_id: number
          updated_at?: string
        }
        Update: {
          client_tasks?: Json | null
          created_at?: string
          documents?: Json | null
          id?: string
          notes?: string | null
          package_id?: number | null
          staff_tasks?: Json | null
          stage_id?: number
          status?: string | null
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          primary_contact: boolean | null
          role: string
          tenant_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          primary_contact?: boolean | null
          role?: string
          tenant_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          primary_contact?: boolean | null
          role?: string
          tenant_id?: number
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          abn: string | null
          accounting_system: string | null
          acn: string | null
          created_at: string
          cricos_id: string | null
          id: number
          id_uuid: string | null
          import_id: number
          is_system_tenant: boolean
          legal_name: string | null
          lms: string | null
          metadata: Json | null
          name: string
          package_added_at: string | null
          package_id: number | null
          package_ids: number[] | null
          risk_level: string | null
          rto_id: string | null
          rto_name: string | null
          slug: string
          sms: string | null
          stage_ids: number[] | null
          state: string | null
          status: string
          tga_connected_at: string | null
          tga_last_synced_at: string | null
          tga_legal_name: string | null
          tga_snapshot: Json | null
          tga_status: string | null
          tga_sync_status: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          abn?: string | null
          accounting_system?: string | null
          acn?: string | null
          created_at?: string
          cricos_id?: string | null
          id: number
          id_uuid?: string | null
          import_id?: number
          is_system_tenant?: boolean
          legal_name?: string | null
          lms?: string | null
          metadata?: Json | null
          name: string
          package_added_at?: string | null
          package_id?: number | null
          package_ids?: number[] | null
          risk_level?: string | null
          rto_id?: string | null
          rto_name?: string | null
          slug: string
          sms?: string | null
          stage_ids?: number[] | null
          state?: string | null
          status?: string
          tga_connected_at?: string | null
          tga_last_synced_at?: string | null
          tga_legal_name?: string | null
          tga_snapshot?: Json | null
          tga_status?: string | null
          tga_sync_status?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          abn?: string | null
          accounting_system?: string | null
          acn?: string | null
          created_at?: string
          cricos_id?: string | null
          id?: number
          id_uuid?: string | null
          import_id?: number
          is_system_tenant?: boolean
          legal_name?: string | null
          lms?: string | null
          metadata?: Json | null
          name?: string
          package_added_at?: string | null
          package_id?: number | null
          package_ids?: number[] | null
          risk_level?: string | null
          rto_id?: string | null
          rto_name?: string | null
          slug?: string
          sms?: string | null
          stage_ids?: number[] | null
          state?: string | null
          status?: string
          tga_connected_at?: string | null
          tga_last_synced_at?: string | null
          tga_legal_name?: string | null
          tga_snapshot?: Json | null
          tga_status?: string | null
          tga_sync_status?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      tga_cache: {
        Row: {
          created_at: string
          fetched_at: string
          id: string
          product_code: string
          product_type: string
          release_version: string | null
          source_hash: string
          source_payload: Json | null
          status: string | null
          superseded_by: string | null
          tenant_id: number
          title: string
          training_package: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          id?: string
          product_code: string
          product_type: string
          release_version?: string | null
          source_hash: string
          source_payload?: Json | null
          status?: string | null
          superseded_by?: string | null
          tenant_id: number
          title: string
          training_package?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: string
          product_code?: string
          product_type?: string
          release_version?: string | null
          source_hash?: string
          source_payload?: Json | null
          status?: string | null
          superseded_by?: string | null
          tenant_id?: number
          title?: string
          training_package?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tga_debug_payloads: {
        Row: {
          endpoint: string
          fetched_at: string
          http_status: number | null
          id: string
          payload: Json | null
          record_count: number | null
          rto_code: string | null
          tenant_id: number | null
        }
        Insert: {
          endpoint: string
          fetched_at?: string
          http_status?: number | null
          id?: string
          payload?: Json | null
          record_count?: number | null
          rto_code?: string | null
          tenant_id?: number | null
        }
        Update: {
          endpoint?: string
          fetched_at?: string
          http_status?: number | null
          id?: string
          payload?: Json | null
          record_count?: number | null
          rto_code?: string | null
          tenant_id?: number | null
        }
        Relationships: []
      }
      tga_import_audit: {
        Row: {
          action: string
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          rows_affected: number | null
          rto_code: string
          run_id: string | null
          stage: string | null
          status: string | null
          tenant_id: number
          triggered_by: string | null
        }
        Insert: {
          action?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          rows_affected?: number | null
          rto_code: string
          run_id?: string | null
          stage?: string | null
          status?: string | null
          tenant_id: number
          triggered_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          rows_affected?: number | null
          rto_code?: string
          run_id?: string | null
          stage?: string | null
          status?: string | null
          tenant_id?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      tga_import_jobs: {
        Row: {
          codes: string[]
          created_at: string
          created_by: string
          error: string | null
          id: string
          results: Json | null
          rows_upserted: number | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          codes: string[]
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          results?: Json | null
          rows_upserted?: number | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          codes?: string[]
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          results?: Json | null
          rows_upserted?: number | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      tga_import_runs: {
        Row: {
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          notes: string | null
          records_processed: number
          run_type: string
          source_checksum: string | null
          source_ref: string | null
          started_at: string
          status: string
        }
        Insert: {
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          records_processed?: number
          run_type: string
          source_checksum?: string | null
          source_ref?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          records_processed?: number
          run_type?: string
          source_checksum?: string | null
          source_ref?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      tga_import_state: {
        Row: {
          id: number
          latest_success: string | null
          latest_success_import_id: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          latest_success?: string | null
          latest_success_import_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          latest_success?: string | null
          latest_success_import_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tga_import_state_latest_success_import_id_fkey"
            columns: ["latest_success_import_id"]
            isOneToOne: false
            referencedRelation: "tga_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tga_links: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          is_linked: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          link_status: string
          rto_number: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_linked?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          link_status?: string
          rto_number: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_linked?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          link_status?: string
          rto_number?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tga_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tga_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      tga_organisations: {
        Row: {
          abn: string | null
          address_line1: string | null
          address_line2: string | null
          code: string
          country: string | null
          created_at: string
          email: string | null
          fetched_at: string
          id: string
          legal_name: string
          organisation_type: string | null
          phone: string | null
          postcode: string | null
          registration_end_date: string | null
          registration_start_date: string | null
          source_hash: string
          source_payload: Json | null
          state: string | null
          status: string | null
          suburb: string | null
          trading_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          abn?: string | null
          address_line1?: string | null
          address_line2?: string | null
          code: string
          country?: string | null
          created_at?: string
          email?: string | null
          fetched_at?: string
          id?: string
          legal_name: string
          organisation_type?: string | null
          phone?: string | null
          postcode?: string | null
          registration_end_date?: string | null
          registration_start_date?: string | null
          source_hash: string
          source_payload?: Json | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          abn?: string | null
          address_line1?: string | null
          address_line2?: string | null
          code?: string
          country?: string | null
          created_at?: string
          email?: string | null
          fetched_at?: string
          id?: string
          legal_name?: string
          organisation_type?: string | null
          phone?: string | null
          postcode?: string | null
          registration_end_date?: string | null
          registration_start_date?: string | null
          source_hash?: string
          source_payload?: Json | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      tga_rest_sync_jobs: {
        Row: {
          created_at: string | null
          id: string
          last_error: string | null
          payload: Json | null
          rto_id: string
          scope_counts: Json | null
          status: string | null
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          rto_id: string
          scope_counts?: Json | null
          status?: string | null
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          rto_id?: string
          scope_counts?: Json | null
          status?: string | null
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      tga_rto_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_type: string
          country: string | null
          created_at: string
          email: string | null
          fax: string | null
          fetched_at: string
          id: string
          phone: string | null
          postcode: string | null
          rto_code: string
          source_payload: Json | null
          state: string | null
          suburb: string | null
          tenant_id: number
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type?: string
          country?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          fetched_at?: string
          id?: string
          phone?: string | null
          postcode?: string | null
          rto_code: string
          source_payload?: Json | null
          state?: string | null
          suburb?: string | null
          tenant_id: number
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type?: string
          country?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          fetched_at?: string
          id?: string
          phone?: string | null
          postcode?: string | null
          rto_code?: string
          source_payload?: Json | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number
          website?: string | null
        }
        Relationships: []
      }
      tga_rto_contacts: {
        Row: {
          address: string | null
          contact_type: string | null
          contact_type_raw: string | null
          created_at: string
          email: string | null
          fax: string | null
          fetched_at: string
          id: string
          mobile: string | null
          name: string | null
          organisation_name: string | null
          phone: string | null
          position: string | null
          rto_code: string
          source_payload: Json | null
          tenant_id: number
        }
        Insert: {
          address?: string | null
          contact_type?: string | null
          contact_type_raw?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          fetched_at?: string
          id?: string
          mobile?: string | null
          name?: string | null
          organisation_name?: string | null
          phone?: string | null
          position?: string | null
          rto_code: string
          source_payload?: Json | null
          tenant_id: number
        }
        Update: {
          address?: string | null
          contact_type?: string | null
          contact_type_raw?: string | null
          created_at?: string
          email?: string | null
          fax?: string | null
          fetched_at?: string
          id?: string
          mobile?: string | null
          name?: string | null
          organisation_name?: string | null
          phone?: string | null
          position?: string | null
          rto_code?: string
          source_payload?: Json | null
          tenant_id?: number
        }
        Relationships: []
      }
      tga_rto_delivery_locations: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          country: string | null
          created_at: string
          fetched_at: string
          id: string
          location_name: string | null
          postcode: string | null
          rto_code: string
          source_payload: Json | null
          state: string | null
          suburb: string | null
          tenant_id: number
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          country?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          location_name?: string | null
          postcode?: string | null
          rto_code: string
          source_payload?: Json | null
          state?: string | null
          suburb?: string | null
          tenant_id: number
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          country?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          location_name?: string | null
          postcode?: string | null
          rto_code?: string
          source_payload?: Json | null
          state?: string | null
          suburb?: string | null
          tenant_id?: number
        }
        Relationships: []
      }
      tga_rto_import_jobs: {
        Row: {
          addresses_fetched: boolean | null
          attempts: number | null
          completed_at: string | null
          contacts_fetched: boolean | null
          courses_count: number | null
          created_at: string
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number | null
          payload_meta: Json | null
          qualifications_count: number | null
          rto_code: string
          run_id: string | null
          scope_fetched: boolean | null
          skillsets_count: number | null
          stage: string | null
          started_at: string | null
          status: string
          summary_fetched: boolean | null
          tenant_id: number
          units_count: number | null
        }
        Insert: {
          addresses_fetched?: boolean | null
          attempts?: number | null
          completed_at?: string | null
          contacts_fetched?: boolean | null
          courses_count?: number | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number | null
          payload_meta?: Json | null
          qualifications_count?: number | null
          rto_code: string
          run_id?: string | null
          scope_fetched?: boolean | null
          skillsets_count?: number | null
          stage?: string | null
          started_at?: string | null
          status?: string
          summary_fetched?: boolean | null
          tenant_id: number
          units_count?: number | null
        }
        Update: {
          addresses_fetched?: boolean | null
          attempts?: number | null
          completed_at?: string | null
          contacts_fetched?: boolean | null
          courses_count?: number | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number | null
          payload_meta?: Json | null
          qualifications_count?: number | null
          rto_code?: string
          run_id?: string | null
          scope_fetched?: boolean | null
          skillsets_count?: number | null
          stage?: string | null
          started_at?: string | null
          status?: string
          summary_fetched?: boolean | null
          tenant_id?: number
          units_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tga_rto_import_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tga_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tga_rto_snapshots: {
        Row: {
          created_at: string | null
          id: string
          payload: Json
          raw_sha256: string | null
          rto_id: string
          source_url: string | null
          tenant_id: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload: Json
          raw_sha256?: string | null
          rto_id: string
          source_url?: string | null
          tenant_id: number
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json
          raw_sha256?: string | null
          rto_id?: string
          source_url?: string | null
          tenant_id?: number
        }
        Relationships: []
      }
      tga_rto_summary: {
        Row: {
          abn: string | null
          acn: string | null
          created_at: string
          fetched_at: string
          id: string
          initial_registration_date: string | null
          legal_name: string | null
          organisation_type: string | null
          registration_end_date: string | null
          registration_start_date: string | null
          rto_code: string
          source_hash: string | null
          source_payload: Json | null
          status: string | null
          tenant_id: number
          trading_name: string | null
          updated_at: string
          web_address: string | null
        }
        Insert: {
          abn?: string | null
          acn?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          initial_registration_date?: string | null
          legal_name?: string | null
          organisation_type?: string | null
          registration_end_date?: string | null
          registration_start_date?: string | null
          rto_code: string
          source_hash?: string | null
          source_payload?: Json | null
          status?: string | null
          tenant_id: number
          trading_name?: string | null
          updated_at?: string
          web_address?: string | null
        }
        Update: {
          abn?: string | null
          acn?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          initial_registration_date?: string | null
          legal_name?: string | null
          organisation_type?: string | null
          registration_end_date?: string | null
          registration_start_date?: string | null
          rto_code?: string
          source_hash?: string | null
          source_payload?: Json | null
          status?: string | null
          tenant_id?: number
          trading_name?: string | null
          updated_at?: string
          web_address?: string | null
        }
        Relationships: []
      }
      tga_rtos: {
        Row: {
          abn: string | null
          address_json: Json | null
          cricos_provider_number: string | null
          email: string | null
          last_seen_in_import_id: string | null
          legal_name: string | null
          phone: string | null
          registration_end: string | null
          registration_start: string | null
          rto_number: string
          status: string | null
          trading_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          abn?: string | null
          address_json?: Json | null
          cricos_provider_number?: string | null
          email?: string | null
          last_seen_in_import_id?: string | null
          legal_name?: string | null
          phone?: string | null
          registration_end?: string | null
          registration_start?: string | null
          rto_number: string
          status?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          abn?: string | null
          address_json?: Json | null
          cricos_provider_number?: string | null
          email?: string | null
          last_seen_in_import_id?: string | null
          legal_name?: string | null
          phone?: string | null
          registration_end?: string | null
          registration_start?: string | null
          rto_number?: string
          status?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tga_rtos_last_seen_in_import_id_fkey"
            columns: ["last_seen_in_import_id"]
            isOneToOne: false
            referencedRelation: "tga_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tga_scope_courses: {
        Row: {
          course_code: string
          course_title: string | null
          created_at: string
          delivery_notification: string | null
          end_date: string | null
          extent: string | null
          fetched_at: string
          id: string
          is_current: boolean | null
          rto_code: string
          source_payload: Json | null
          start_date: string | null
          status: string | null
          tenant_id: number
          usage_recommendation: string | null
        }
        Insert: {
          course_code: string
          course_title?: string | null
          created_at?: string
          delivery_notification?: string | null
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          rto_code: string
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id: number
          usage_recommendation?: string | null
        }
        Update: {
          course_code?: string
          course_title?: string | null
          created_at?: string
          delivery_notification?: string | null
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          rto_code?: string
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id?: number
          usage_recommendation?: string | null
        }
        Relationships: []
      }
      tga_scope_items: {
        Row: {
          code: string
          created_at: string
          currency_end: string | null
          currency_start: string | null
          id: string
          import_id: string | null
          rto_number: string
          status: string | null
          title: string | null
          type: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_end?: string | null
          currency_start?: string | null
          id?: string
          import_id?: string | null
          rto_number: string
          status?: string | null
          title?: string | null
          type: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_end?: string | null
          currency_start?: string | null
          id?: string
          import_id?: string | null
          rto_number?: string
          status?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tga_scope_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "tga_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tga_scope_items_rto_number_fkey"
            columns: ["rto_number"]
            isOneToOne: false
            referencedRelation: "tga_rtos"
            referencedColumns: ["rto_number"]
          },
        ]
      }
      tga_scope_qualifications: {
        Row: {
          created_at: string
          delivery_notification: string | null
          end_date: string | null
          extent: string | null
          fetched_at: string
          id: string
          is_current: boolean | null
          qualification_code: string
          qualification_title: string | null
          rto_code: string
          source_payload: Json | null
          start_date: string | null
          status: string | null
          tenant_id: number
          training_package_code: string | null
          training_package_title: string | null
          usage_recommendation: string | null
        }
        Insert: {
          created_at?: string
          delivery_notification?: string | null
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          qualification_code: string
          qualification_title?: string | null
          rto_code: string
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id: number
          training_package_code?: string | null
          training_package_title?: string | null
          usage_recommendation?: string | null
        }
        Update: {
          created_at?: string
          delivery_notification?: string | null
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          qualification_code?: string
          qualification_title?: string | null
          rto_code?: string
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id?: number
          training_package_code?: string | null
          training_package_title?: string | null
          usage_recommendation?: string | null
        }
        Relationships: []
      }
      tga_scope_skillsets: {
        Row: {
          created_at: string
          end_date: string | null
          extent: string | null
          fetched_at: string
          id: string
          is_current: boolean | null
          rto_code: string
          skillset_code: string
          skillset_title: string | null
          source_payload: Json | null
          start_date: string | null
          status: string | null
          tenant_id: number
          training_package_code: string | null
          training_package_title: string | null
          usage_recommendation: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          rto_code: string
          skillset_code: string
          skillset_title?: string | null
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id: number
          training_package_code?: string | null
          training_package_title?: string | null
          usage_recommendation?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          rto_code?: string
          skillset_code?: string
          skillset_title?: string | null
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id?: number
          training_package_code?: string | null
          training_package_title?: string | null
          usage_recommendation?: string | null
        }
        Relationships: []
      }
      tga_scope_units: {
        Row: {
          created_at: string
          delivery_notification: string | null
          end_date: string | null
          extent: string | null
          fetched_at: string
          id: string
          is_current: boolean | null
          is_explicit: boolean | null
          rto_code: string
          source_payload: Json | null
          start_date: string | null
          status: string | null
          tenant_id: number
          training_package_code: string | null
          training_package_title: string | null
          unit_code: string
          unit_title: string | null
          usage_recommendation: string | null
        }
        Insert: {
          created_at?: string
          delivery_notification?: string | null
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          is_explicit?: boolean | null
          rto_code: string
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id: number
          training_package_code?: string | null
          training_package_title?: string | null
          unit_code: string
          unit_title?: string | null
          usage_recommendation?: string | null
        }
        Update: {
          created_at?: string
          delivery_notification?: string | null
          end_date?: string | null
          extent?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          is_explicit?: boolean | null
          rto_code?: string
          source_payload?: Json | null
          start_date?: string | null
          status?: string | null
          tenant_id?: number
          training_package_code?: string | null
          training_package_title?: string | null
          unit_code?: string
          unit_title?: string | null
          usage_recommendation?: string | null
        }
        Relationships: []
      }
      tga_state_codes: {
        Row: {
          abbreviation: string
          code: string
          name: string
        }
        Insert: {
          abbreviation: string
          code: string
          name: string
        }
        Update: {
          abbreviation?: string
          code?: string
          name?: string
        }
        Relationships: []
      }
      tga_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          delta_since: string | null
          error_details: Json | null
          error_message: string | null
          id: string
          job_type: string
          records_failed: number | null
          records_fetched: number | null
          records_inserted: number | null
          records_unchanged: number | null
          records_updated: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          delta_since?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          job_type: string
          records_failed?: number | null
          records_fetched?: number | null
          records_inserted?: number | null
          records_unchanged?: number | null
          records_updated?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          delta_since?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          job_type?: string
          records_failed?: number | null
          records_fetched?: number | null
          records_inserted?: number | null
          records_unchanged?: number | null
          records_updated?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tga_sync_status: {
        Row: {
          connection_status: string | null
          current_job_id: string | null
          id: number
          is_syncing: boolean | null
          last_delta_sync_at: string | null
          last_full_sync_at: string | null
          last_health_check_at: string | null
          last_health_check_result: Json | null
          last_sync_job_id: string | null
          organisations_count: number | null
          products_count: number | null
          units_count: number | null
          updated_at: string
        }
        Insert: {
          connection_status?: string | null
          current_job_id?: string | null
          id?: number
          is_syncing?: boolean | null
          last_delta_sync_at?: string | null
          last_full_sync_at?: string | null
          last_health_check_at?: string | null
          last_health_check_result?: Json | null
          last_sync_job_id?: string | null
          organisations_count?: number | null
          products_count?: number | null
          units_count?: number | null
          updated_at?: string
        }
        Update: {
          connection_status?: string | null
          current_job_id?: string | null
          id?: number
          is_syncing?: boolean | null
          last_delta_sync_at?: string | null
          last_full_sync_at?: string | null
          last_health_check_at?: string | null
          last_health_check_result?: Json | null
          last_sync_job_id?: string | null
          organisations_count?: number | null
          products_count?: number | null
          units_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tga_sync_status_current_job_id_fkey"
            columns: ["current_job_id"]
            isOneToOne: false
            referencedRelation: "tga_sync_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tga_sync_status_last_sync_job_id_fkey"
            columns: ["last_sync_job_id"]
            isOneToOne: false
            referencedRelation: "tga_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      tga_training_products: {
        Row: {
          code: string
          created_at: string
          currency_status: string | null
          fetched_at: string
          id: string
          is_current: boolean | null
          product_type: string
          release_date: string | null
          release_number: string | null
          source_hash: string
          source_payload: Json | null
          status: string | null
          superseded_by: string | null
          title: string
          training_package_code: string | null
          training_package_title: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_status?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          product_type: string
          release_date?: string | null
          release_number?: string | null
          source_hash: string
          source_payload?: Json | null
          status?: string | null
          superseded_by?: string | null
          title: string
          training_package_code?: string | null
          training_package_title?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_status?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          product_type?: string
          release_date?: string | null
          release_number?: string | null
          source_hash?: string
          source_payload?: Json | null
          status?: string | null
          superseded_by?: string | null
          title?: string
          training_package_code?: string | null
          training_package_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tga_units: {
        Row: {
          code: string
          created_at: string
          currency_status: string | null
          fetched_at: string
          id: string
          is_current: boolean | null
          nominal_hours: number | null
          release_date: string | null
          release_number: string | null
          source_hash: string
          source_payload: Json | null
          status: string | null
          superseded_by: string | null
          title: string
          training_package_code: string | null
          training_package_title: string | null
          updated_at: string
          usage_recommendation: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency_status?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          nominal_hours?: number | null
          release_date?: string | null
          release_number?: string | null
          source_hash: string
          source_payload?: Json | null
          status?: string | null
          superseded_by?: string | null
          title: string
          training_package_code?: string | null
          training_package_title?: string | null
          updated_at?: string
          usage_recommendation?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency_status?: string | null
          fetched_at?: string
          id?: string
          is_current?: boolean | null
          nominal_hours?: number | null
          release_date?: string | null
          release_number?: string | null
          source_hash?: string
          source_payload?: Json | null
          status?: string | null
          superseded_by?: string | null
          title?: string
          training_package_code?: string | null
          training_package_title?: string | null
          updated_at?: string
          usage_recommendation?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          calendar_event_id: string | null
          client_id: number
          created_at: string
          duration_minutes: number
          end_at: string | null
          id: string
          is_billable: boolean
          notes: string | null
          package_id: number | null
          source: string
          stage_id: number | null
          start_at: string | null
          task_id: string | null
          tenant_id: number
          updated_at: string
          user_id: string
          work_type: string
        }
        Insert: {
          calendar_event_id?: string | null
          client_id: number
          created_at?: string
          duration_minutes: number
          end_at?: string | null
          id?: string
          is_billable?: boolean
          notes?: string | null
          package_id?: number | null
          source?: string
          stage_id?: number | null
          start_at?: string | null
          task_id?: string | null
          tenant_id: number
          updated_at?: string
          user_id: string
          work_type?: string
        }
        Update: {
          calendar_event_id?: string | null
          client_id?: number
          created_at?: string
          duration_minutes?: number
          end_at?: string | null
          id?: string
          is_billable?: boolean
          notes?: string | null
          package_id?: number | null
          source?: string
          stage_id?: number | null
          start_at?: string | null
          task_id?: string | null
          tenant_id?: number
          updated_at?: string
          user_id?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      time_tracking: {
        Row: {
          client_id: string | null
          created_at: string | null
          hours_allocated: number | null
          hours_used: number | null
          id: string
          month_year: string
          package_type: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          hours_allocated?: number | null
          hours_used?: number | null
          id?: string
          month_year: string
          package_type?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          hours_allocated?: number | null
          hours_used?: number | null
          id?: string
          month_year?: string
          package_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      timezone_options: {
        Row: {
          country_code: string
          created_at: string
          id: number
          is_active: boolean
          timezone_label: string
          timezone_value: string
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: never
          is_active?: boolean
          timezone_label: string
          timezone_value: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: never
          is_active?: boolean
          timezone_label?: string
          timezone_value?: string
        }
        Relationships: []
      }
      timezones: {
        Row: {
          country_code: string | null
          display_order: number | null
          label: string
          tz: string
          utc_offset_minutes: number
        }
        Insert: {
          country_code?: string | null
          display_order?: number | null
          label: string
          tz: string
          utc_offset_minutes: number
        }
        Update: {
          country_code?: string | null
          display_order?: number | null
          label?: string
          tz?: string
          utc_offset_minutes?: number
        }
        Relationships: []
      }
      trainer_training_products: {
        Row: {
          trainer_id: string
          training_product_id: string
        }
        Insert: {
          trainer_id: string
          training_product_id: string
        }
        Update: {
          trainer_id?: string
          training_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_training_products_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_training_products_training_product_id_fkey"
            columns: ["training_product_id"]
            isOneToOne: false
            referencedRelation: "training_products"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          phone_number: string | null
          surname: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          id?: string
          phone_number?: string | null
          surname: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          phone_number?: string | null
          surname?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      training_folders: {
        Row: {
          created_at: string
          folder_name: string
          id: string
        }
        Insert: {
          created_at?: string
          folder_name: string
          id?: string
        }
        Update: {
          created_at?: string
          folder_name?: string
          id?: string
        }
        Relationships: []
      }
      training_products: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      training_videos: {
        Row: {
          created_at: string
          folder_id: string
          folder_name: string | null
          id: string
          video_name: string
          vimeo_url: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          folder_name?: string | null
          id?: string
          video_name: string
          vimeo_url: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          folder_name?: string | null
          id?: string
          video_name?: string
          vimeo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_videos_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "training_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      unicorn_import_logs: {
        Row: {
          details: Json | null
          id: string
          import_id: string
          message: string
          status: string
          step: string
          timestamp: string
        }
        Insert: {
          details?: Json | null
          id?: string
          import_id: string
          message: string
          status: string
          step: string
          timestamp?: string
        }
        Update: {
          details?: Json | null
          id?: string
          import_id?: string
          message?: string
          status?: string
          step?: string
          timestamp?: string
        }
        Relationships: []
      }
      unit_cache: {
        Row: {
          data: Json
          id: number
          last_updated: string | null
          rto_id: string
          unit_code: string
        }
        Insert: {
          data: Json
          id?: number
          last_updated?: string | null
          rto_id: string
          unit_code: string
        }
        Update: {
          data?: Json
          id?: number
          last_updated?: string | null
          rto_id?: string
          unit_code?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          created_at: string | null
          docs_downloaded: number | null
          id: string
          login_date: string
          messages_sent: number | null
          tasks_created: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          docs_downloaded?: number | null
          id?: string
          login_date: string
          messages_sent?: number | null
          tasks_created?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          docs_downloaded?: number | null
          id?: string
          login_date?: string
          messages_sent?: number | null
          tasks_created?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string | null
          email: string
          expires_at: string
          first_name: string
          id: string
          invited_by: string | null
          last_name: string | null
          last_sent_at: string | null
          mailgun_message_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          status: string
          tenant_id: number
          token_hash: string | null
          unicorn_role: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          first_name?: string
          id?: string
          invited_by?: string | null
          last_name?: string | null
          last_sent_at?: string | null
          mailgun_message_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          tenant_id: number
          token_hash?: string | null
          unicorn_role: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          first_name?: string
          id?: string
          invited_by?: string | null
          last_name?: string | null
          last_sent_at?: string | null
          mailgun_message_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          tenant_id?: number
          token_hash?: string | null
          unicorn_role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_notification_prefs: {
        Row: {
          created_at: string | null
          digest_enabled: boolean | null
          email_enabled: boolean | null
          event_settings: Json | null
          id: string
          inapp_enabled: boolean | null
          quiet_hours: Json | null
          tenant_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          digest_enabled?: boolean | null
          email_enabled?: boolean | null
          event_settings?: Json | null
          id?: string
          inapp_enabled?: boolean | null
          quiet_hours?: Json | null
          tenant_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          digest_enabled?: boolean | null
          email_enabled?: boolean | null
          event_settings?: Json | null
          id?: string
          inapp_enabled?: boolean | null
          quiet_hours?: Json | null
          tenant_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          tenant_id: number | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          tenant_id?: number | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          tenant_id?: number | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_time_capture_settings: {
        Row: {
          auto_create_meeting_drafts: boolean
          created_at: string
          id: string
          include_organizer_only: boolean
          max_minutes: number
          min_minutes: number
          tenant_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_create_meeting_drafts?: boolean
          created_at?: string
          id?: string
          include_organizer_only?: boolean
          max_minutes?: number
          min_minutes?: number
          tenant_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_create_meeting_drafts?: boolean
          created_at?: string
          id?: string
          include_organizer_only?: boolean
          max_minutes?: number
          min_minutes?: number
          tenant_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_time_inbox_dismissals: {
        Row: {
          created_at: string
          dismiss_date: string
          id: string
          tenant_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          dismiss_date: string
          id?: string
          tenant_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          dismiss_date?: string
          id?: string
          tenant_id?: number
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          abn: string | null
          accountable_person: string | null
          accounting_system: string | null
          acn: string | null
          archived: boolean
          availability_note: string | null
          avatar_path: string | null
          avatar_updated_at: string | null
          avatar_url: string | null
          away_message: string | null
          bio: string | null
          biography: string | null
          booking_url: string | null
          clickup_url: string | null
          client_id: string | null
          communication_pref: string | null
          country: string | null
          cover_user_id: string | null
          created_at: string | null
          cricos_id: string | null
          csc_visibility: Json | null
          disabled: boolean
          email: string
          email_address: string | null
          first_name: string
          global_role: string | null
          head_office_address: string | null
          is_csc: boolean | null
          is_team: boolean | null
          job_title: string | null
          keap_url: string | null
          last_name: string
          last_new_client_tasks_email: string | null
          last_sign_in_at: string | null
          leave_from: string | null
          leave_until: string | null
          legacy_id: number | null
          legal_name: string | null
          linkedin: string | null
          linkedin_url: string | null
          lms: string | null
          manager_id: number | null
          manager_uuid: string | null
          mobile_phone: string | null
          notes: string | null
          phone: string | null
          phone_number: string | null
          po_box: string | null
          po_box_address: string | null
          postcode: string | null
          profile_photo: boolean | null
          public_holiday_region: string | null
          registration_end_date: string | null
          response_time_sla: string | null
          role: string | null
          rto_id: number | null
          rto_name: string | null
          staff_team: Database["public"]["Enums"]["staff_team_type"] | null
          staff_teams: string[] | null
          state: number | null
          street_address: string | null
          street_number_and_name: string | null
          suburb: string | null
          superadmin_level: string | null
          tenant_id: number | null
          tenant_name: string | null
          tenant_role: string | null
          timezone: string | null
          title: string | null
          training_facility_address: string | null
          TS: string | null
          unicorn_role: Database["public"]["Enums"]["unicorn_role"]
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type_enum"]
          user_uuid: string
          website: string | null
          working_days: Json | null
          working_hours: Json | null
        }
        Insert: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          archived?: boolean
          availability_note?: string | null
          avatar_path?: string | null
          avatar_updated_at?: string | null
          avatar_url?: string | null
          away_message?: string | null
          bio?: string | null
          biography?: string | null
          booking_url?: string | null
          clickup_url?: string | null
          client_id?: string | null
          communication_pref?: string | null
          country?: string | null
          cover_user_id?: string | null
          created_at?: string | null
          cricos_id?: string | null
          csc_visibility?: Json | null
          disabled?: boolean
          email: string
          email_address?: string | null
          first_name: string
          global_role?: string | null
          head_office_address?: string | null
          is_csc?: boolean | null
          is_team?: boolean | null
          job_title?: string | null
          keap_url?: string | null
          last_name: string
          last_new_client_tasks_email?: string | null
          last_sign_in_at?: string | null
          leave_from?: string | null
          leave_until?: string | null
          legacy_id?: number | null
          legal_name?: string | null
          linkedin?: string | null
          linkedin_url?: string | null
          lms?: string | null
          manager_id?: number | null
          manager_uuid?: string | null
          mobile_phone?: string | null
          notes?: string | null
          phone?: string | null
          phone_number?: string | null
          po_box?: string | null
          po_box_address?: string | null
          postcode?: string | null
          profile_photo?: boolean | null
          public_holiday_region?: string | null
          registration_end_date?: string | null
          response_time_sla?: string | null
          role?: string | null
          rto_id?: number | null
          rto_name?: string | null
          staff_team?: Database["public"]["Enums"]["staff_team_type"] | null
          staff_teams?: string[] | null
          state?: number | null
          street_address?: string | null
          street_number_and_name?: string | null
          suburb?: string | null
          superadmin_level?: string | null
          tenant_id?: number | null
          tenant_name?: string | null
          tenant_role?: string | null
          timezone?: string | null
          title?: string | null
          training_facility_address?: string | null
          TS?: string | null
          unicorn_role?: Database["public"]["Enums"]["unicorn_role"]
          updated_at?: string
          user_type: Database["public"]["Enums"]["user_type_enum"]
          user_uuid?: string
          website?: string | null
          working_days?: Json | null
          working_hours?: Json | null
        }
        Update: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          archived?: boolean
          availability_note?: string | null
          avatar_path?: string | null
          avatar_updated_at?: string | null
          avatar_url?: string | null
          away_message?: string | null
          bio?: string | null
          biography?: string | null
          booking_url?: string | null
          clickup_url?: string | null
          client_id?: string | null
          communication_pref?: string | null
          country?: string | null
          cover_user_id?: string | null
          created_at?: string | null
          cricos_id?: string | null
          csc_visibility?: Json | null
          disabled?: boolean
          email?: string
          email_address?: string | null
          first_name?: string
          global_role?: string | null
          head_office_address?: string | null
          is_csc?: boolean | null
          is_team?: boolean | null
          job_title?: string | null
          keap_url?: string | null
          last_name?: string
          last_new_client_tasks_email?: string | null
          last_sign_in_at?: string | null
          leave_from?: string | null
          leave_until?: string | null
          legacy_id?: number | null
          legal_name?: string | null
          linkedin?: string | null
          linkedin_url?: string | null
          lms?: string | null
          manager_id?: number | null
          manager_uuid?: string | null
          mobile_phone?: string | null
          notes?: string | null
          phone?: string | null
          phone_number?: string | null
          po_box?: string | null
          po_box_address?: string | null
          postcode?: string | null
          profile_photo?: boolean | null
          public_holiday_region?: string | null
          registration_end_date?: string | null
          response_time_sla?: string | null
          role?: string | null
          rto_id?: number | null
          rto_name?: string | null
          staff_team?: Database["public"]["Enums"]["staff_team_type"] | null
          staff_teams?: string[] | null
          state?: number | null
          street_address?: string | null
          street_number_and_name?: string | null
          suburb?: string | null
          superadmin_level?: string | null
          tenant_id?: number | null
          tenant_name?: string | null
          tenant_role?: string | null
          timezone?: string | null
          title?: string | null
          training_facility_address?: string | null
          TS?: string | null
          unicorn_role?: Database["public"]["Enums"]["unicorn_role"]
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type_enum"]
          user_uuid?: string
          website?: string | null
          working_days?: Json | null
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_cover_user_id_fkey"
            columns: ["cover_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_uuid"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_client_snapshot: {
        Row: {
          at_risk: boolean | null
          audit_due: string | null
          consult_hours: number | null
          framework: string | null
          id: string | null
          package_type: string | null
          risk_flags_count: number | null
          risk_level: string | null
          risk_score: number | null
          rto_name: string | null
          tailoring_complete: number | null
          trainer_credential_status: string | null
          untailored_documents: number | null
        }
        Relationships: []
      }
      document_stage_usage: {
        Row: {
          document_id: number | null
          stage_count: number | null
          stage_names: string[] | null
          title: string | null
        }
        Relationships: []
      }
      eos_issue_category_options: {
        Row: {
          value: string | null
        }
        Relationships: []
      }
      eos_issue_impact_options: {
        Row: {
          value: string | null
        }
        Relationships: []
      }
      eos_issue_status_options: {
        Row: {
          value: string | null
        }
        Relationships: []
      }
      eos_issue_type_options: {
        Row: {
          value: string | null
        }
        Relationships: []
      }
      eos_meeting_attendance_summary: {
        Row: {
          attendance_rate: number | null
          invited_count: number | null
          late_count: number | null
          left_early_count: number | null
          meeting_id: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"] | null
          no_show_count: number | null
          present_count: number | null
          quorum_met: boolean | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["meeting_status"] | null
          title: string | null
        }
        Relationships: []
      }
      eos_past_meetings: {
        Row: {
          actual_duration_minutes: number | null
          agenda_snapshot: Json | null
          client_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_minutes_version_id: string | null
          duration_minutes: number | null
          headlines: Json | null
          id: string | null
          is_complete: boolean | null
          is_multi_client: boolean | null
          issues_discussed: string[] | null
          location: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"] | null
          minutes_status: string | null
          notes: string | null
          parent_meeting_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          recurrence_type: string | null
          rock_reviews: Json | null
          scheduled_date: string | null
          scorecard_data: Json | null
          series_id: string | null
          series_title: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["meeting_status"] | null
          template_id: string | null
          template_version_id: string | null
          tenant_id: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_current_minutes_version"
            columns: ["current_minutes_version_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_minutes_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_quarter_options: {
        Row: {
          value: number | null
        }
        Relationships: []
      }
      eos_upcoming_meetings: {
        Row: {
          actual_duration_minutes: number | null
          agenda_snapshot: Json | null
          client_id: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_minutes_version_id: string | null
          duration_minutes: number | null
          headlines: Json | null
          id: string | null
          is_complete: boolean | null
          is_multi_client: boolean | null
          issues_discussed: string[] | null
          location: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"] | null
          minutes_status: string | null
          notes: string | null
          parent_meeting_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          recurrence_type: string | null
          rock_reviews: Json | null
          scheduled_date: string | null
          scorecard_data: Json | null
          series_id: string | null
          series_is_active: boolean | null
          started_at: string | null
          status: Database["public"]["Enums"]["meeting_status"] | null
          template_id: string | null
          template_version_id: string | null
          tenant_id: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "dashboard_client_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_attendance_summary"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_past_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_upcoming_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "eos_agenda_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_current_minutes_version"
            columns: ["current_minutes_version_id"]
            isOneToOne: false
            referencedRelation: "eos_meeting_minutes_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_linked_data: {
        Row: {
          active_rocks_count: number | null
          eos_role_type:
            | Database["public"]["Enums"]["eos_seat_role_type"]
            | null
          meetings_attended_count: number | null
          meetings_missed_count: number | null
          primary_owner_id: string | null
          seat_id: string | null
          seat_name: string | null
          tenant_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accountability_seats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_ai_suggestion: {
        Args: { p_suggestion_id: string }
        Returns: string
      }
      accept_invitation_v2: {
        Args: { p_token_hash: string; p_user_id: string }
        Returns: Json
      }
      accept_invite: { Args: { p_token: string }; Returns: Json }
      acknowledge_document: {
        Args: { p_release_id: string }
        Returns: undefined
      }
      add_audit_response: {
        Args: {
          p_audit_question_id: number
          p_notes?: string
          p_rating: string
          p_risk_level?: string
          p_tags?: string[]
        }
        Returns: number
      }
      add_favourite: { Args: { p_resource_id: string }; Returns: undefined }
      add_meeting_attendee: {
        Args: {
          p_meeting_id: string
          p_role?: Database["public"]["Enums"]["meeting_role"]
          p_user_id: string
        }
        Returns: string
      }
      add_meeting_guest: {
        Args: { p_meeting_id: string; p_notes?: string; p_user_id: string }
        Returns: Json
      }
      add_package_to_tenant: {
        Args: { p_package_id: number; p_tenant_id: number }
        Returns: undefined
      }
      admin_fix_invitations: { Args: { dry_run?: boolean }; Returns: Json }
      admin_fix_memberships: { Args: { dry_run?: boolean }; Returns: Json }
      admin_fix_profile_linkage: { Args: { dry_run?: boolean }; Returns: Json }
      admin_fix_user_linkage: { Args: { p_user_uuid: string }; Returns: Json }
      admin_remove_tenant_csc_assignment: {
        Args: { p_csc_user_id: string; p_tenant_id: number }
        Returns: Json
      }
      admin_search_clients: {
        Args: {
          org_types?: string[]
          package_code?: string
          page?: number
          page_size?: number
          q?: string
          sort_by?: string
          sort_dir?: string
        }
        Returns: {
          records: Json
          total_count: number
        }[]
      }
      admin_set_role_type: {
        Args: { p_role_type: string; p_tenant_id?: number; p_user_uuid: string }
        Returns: Json
      }
      admin_set_tenant_csc_assignment: {
        Args: {
          p_csc_user_id: string
          p_is_primary?: boolean
          p_role_label?: string
          p_tenant_id: number
        }
        Returns: Json
      }
      admin_update_csc_profile: {
        Args: {
          p_availability_note?: string
          p_bio?: string
          p_booking_url?: string
          p_csc_visibility?: Json
          p_is_csc?: boolean
          p_job_title?: string
          p_linkedin_url?: string
          p_phone?: string
          p_public_holiday_region?: string
          p_timezone?: string
          p_user_id: string
          p_working_days?: Json
          p_working_hours?: Json
        }
        Returns: Json
      }
      advance_segment: { Args: { p_meeting_id: string }; Returns: string }
      apply_document_ai_analysis: {
        Args: {
          p_category_confidence: number
          p_description_confidence: number
          p_document_id: number
          p_reasoning: string
          p_suggested_category: string
          p_suggested_description: string
          p_user_id?: string
        }
        Returns: Json
      }
      apply_stage_version_to_package: {
        Args: {
          p_package_id: number
          p_stage_id: number
          p_target_version_id: string
        }
        Returns: Json
      }
      apply_template_to_meeting: {
        Args: { p_meeting_id: string; p_template_id: string }
        Returns: undefined
      }
      approve_document_ai_suggestions: {
        Args: {
          p_apply_category?: boolean
          p_apply_description?: boolean
          p_document_id: number
          p_user_id?: string
        }
        Returns: Json
      }
      audit_duplicate_emails: {
        Args: never
        Returns: {
          auth_ids: string[]
          count_auth: number
          count_profiles: number
          email_lower: string
          profile_ids: number[]
        }[]
      }
      audit_email_mismatches: {
        Args: never
        Returns: {
          auth_email: string
          issue: string
          profile_email: string
          profile_id: number
          user_id: string
        }[]
      }
      audit_invalid_memberships: {
        Args: never
        Returns: {
          issue: string
          membership_id: string
          role: string
          status: string
          tenant_id: number
          user_id: string
        }[]
      }
      audit_invitation_issues: {
        Args: never
        Returns: {
          created_at: string
          email: string
          expires_at: string
          invitation_id: string
          issue: string
          status: string
          tenant_id: number
          unicorn_role: string
        }[]
      }
      audit_orphan_auth_users: {
        Args: never
        Returns: {
          auth_user_id: string
          created_at: string
          email: string
          issue: string
          last_sign_in_at: string
        }[]
      }
      audit_orphan_profiles: {
        Args: never
        Returns: {
          created_at: string
          issue: string
          profile_email: string
          profile_id: number
          user_id: string
        }[]
      }
      audit_summary: { Args: never; Returns: Json }
      audit_users_without_membership: {
        Args: never
        Returns: {
          created_at: string
          email: string
          global_role: string
          issue: string
          profile_id: number
          user_id: string
        }[]
      }
      bulk_create_documents_with_versions: {
        Args: {
          p_auto_publish?: boolean
          p_category?: string
          p_documents: Json
          p_standard_refs?: string[]
          p_standard_set?: string
        }
        Returns: Json
      }
      calculate_membership_health: {
        Args: { p_package_id: number; p_tenant_id: number }
        Returns: Json
      }
      calculate_quorum: {
        Args: { p_meeting_id: string }
        Returns: {
          core_team_present: number
          core_team_required: number
          integrator_present: boolean
          issues: string[]
          owner_present: boolean
          quorum_met: boolean
          quorum_present: number
          quorum_required: number
          visionary_present: boolean
        }[]
      }
      can_access_qc: {
        Args: { _qc_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_certified_stage: { Args: { p_stage_id: number }; Returns: Json }
      can_facilitate_eos: {
        Args: { _tenant_id: number; _user_id: string }
        Returns: boolean
      }
      can_manage_packages: { Args: never; Returns: boolean }
      cancel_occurrence: {
        Args: { p_occurrence_id: string }
        Returns: undefined
      }
      cancel_recurrence_series: {
        Args: { p_recurrence_id: string }
        Returns: number
      }
      carry_forward_open_todos: {
        Args: { p_source_meeting_id: string; p_target_meeting_id: string }
        Returns: string[]
      }
      carry_forward_unresolved_issues: {
        Args: { p_meeting_id: string; p_target_meeting_id: string }
        Returns: string[]
      }
      cascade_items: {
        Args: {
          p_item_type: string
          p_source_item_id: string
          p_target_client_ids: string[]
        }
        Returns: string[]
      }
      check_rate_limit: {
        Args: { p_action_type: string; p_tenant_id: number }
        Returns: boolean
      }
      client_tga_link_set: {
        Args: { p_rto_number: string; p_tenant_id: number }
        Returns: Json
      }
      client_tga_link_verify: { Args: { p_tenant_id: number }; Returns: Json }
      close_meeting_with_validation: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      complete_meeting_instance: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      complete_meeting_with_carry_forward: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      copy_stage_template_to_package: {
        Args: { p_package_id: number; p_stage_id: number }
        Returns: undefined
      }
      create_audit: {
        Args: { p_client_id: string; p_created_by: string; p_tenant_id: number }
        Returns: number
      }
      create_audit_action: {
        Args: {
          p_assigned_to: string
          p_description: string
          p_due_date: string
          p_finding_id: number
        }
        Returns: number
      }
      create_issue:
        | {
            Args: {
              p_client_id?: string
              p_description?: string
              p_linked_rock_id?: string
              p_meeting_id?: string
              p_priority?: string
              p_source: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_assigned_to?: string
              p_description?: string
              p_linked_rock_id?: string
              p_meeting_id?: string
              p_meeting_segment_id?: string
              p_priority?: string
              p_source?: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_description?: string
              p_meeting_id?: string
              p_owner_id?: string
              p_priority?: string
              p_rock_id?: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
      create_meeting_basic:
        | {
            Args: {
              p_facilitator_id?: string
              p_meeting_type: string
              p_scheduled_date: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_duration_minutes: number
              p_facilitator_id: string
              p_meeting_type: string
              p_scheduled_date: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
      create_meeting_from_template:
        | {
            Args: {
              p_agenda_template_id: string
              p_duration_minutes: number
              p_facilitator_id: string
              p_participant_ids?: string[]
              p_scheduled_date: string
              p_scribe_id?: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_agenda_template_id: string
              p_duration_minutes: number
              p_facilitator_id?: string
              p_participant_ids?: string[]
              p_scheduled_date: string
              p_scribe_id?: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_created_by: string
              p_meeting_type: string
              p_scheduled_at: string
              p_template_id: string
              p_tenant_id: number
              p_title: string
            }
            Returns: string
          }
      create_meeting_series: {
        Args: {
          p_duration_minutes?: number
          p_location?: string
          p_meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          p_recurrence_type: string
          p_start_date: string
          p_start_time?: string
          p_template_id?: string
          p_template_version_id?: string
          p_tenant_id: number
          p_title: string
          p_weeks_ahead?: number
        }
        Returns: string
      }
      create_minutes_revision: {
        Args: { p_meeting_id: string; p_reason: string }
        Returns: string
      }
      create_recurring_meetings: {
        Args: { p_base_meeting_id: string; p_weeks_ahead?: number }
        Returns: string[]
      }
      create_stage_release: {
        Args: {
          p_document_ids?: number[]
          p_package_id?: number
          p_stage_id?: number
          p_tenant_id: number
        }
        Returns: string
      }
      create_template_version: {
        Args: {
          p_change_summary: string
          p_publish?: boolean
          p_segments: Json
          p_template_id: string
        }
        Returns: string
      }
      create_tenant: {
        Args: { p_admin_email?: string; p_name: string; p_slug: string }
        Returns: string
      }
      create_todos_from_issue:
        | { Args: { p_issue_id: string; p_todos: Json }; Returns: string[] }
        | {
            Args: { p_issue_id: string; p_meeting_id?: string; p_todos: Json }
            Returns: string[]
          }
      current_tenant: { Args: never; Returns: string }
      current_user_email: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      current_user_tenant: { Args: never; Returns: number }
      current_user_tenant_ids: { Args: never; Returns: string[] }
      drop_rock_to_issue: { Args: { p_rock_id: string }; Returns: string }
      finalise_meeting_minutes: {
        Args: { p_meeting_id: string; p_summary: string }
        Returns: string
      }
      fn_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      fn_match_client_for_event: {
        Args: {
          p_attendee_emails: string[]
          p_event_title: string
          p_tenant_id: number
        }
        Returns: {
          client_id: number
          confidence: number
          reason: string
        }[]
      }
      generate_findings: {
        Args: { p_audit_id: number }
        Returns: {
          finding_id: number
          priority: string
          summary: string
        }[]
      }
      generate_meeting_summary: {
        Args: { p_meeting_id: string }
        Returns: string
      }
      generate_series_instances: {
        Args: { p_series_id: string; p_weeks_ahead?: number }
        Returns: {
          meeting_id: string
          scheduled_date: string
        }[]
      }
      generate_username: {
        Args: { p_email: string; p_user_id: string }
        Returns: string
      }
      get_all_resources: {
        Args: never
        Returns: {
          access_level: string
          category: string
          created_at: string
          description: string
          file_url: string
          id: string
          is_favourite: boolean
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          version: string
          video_url: string
        }[]
      }
      get_all_users_with_tenants: {
        Args: never
        Returns: {
          archived: boolean
          disabled: boolean
          email: string
          first_name: string
          last_name: string
          tenant_id: string
          tenant_name: string
          unicorn_role: string
          user_type: string
          user_uuid: string
        }[]
      }
      get_audit_report: { Args: { p_audit_id: number }; Returns: Json }
      get_client_eos_overview: { Args: { p_client_id: string }; Returns: Json }
      get_complete_schema: {
        Args: never
        Returns: {
          schema_name: string
          schema_owner: string
        }[]
      }
      get_csc_users: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          first_name: string
          job_title: string
          last_name: string
          user_uuid: string
        }[]
      }
      get_current_user_role: { Args: never; Returns: string }
      get_current_user_tenant: { Args: never; Returns: number }
      get_current_user_type: { Args: never; Returns: string }
      get_document_stage_usage: {
        Args: { p_document_id: number }
        Returns: {
          package_count: number
          pinned_version_id: string
          pinned_version_number: number
          stage_id: number
          stage_name: string
        }[]
      }
      get_email_automation_stats: {
        Args: { p_tenant_id: number }
        Returns: Json
      }
      get_membership_rollups: {
        Args: never
        Returns: {
          current_stage_name: string
          current_stage_status: string
          next_action_due_at: string
          next_action_owner_id: string
          next_action_reason: string
          next_action_source: string
          next_action_title: string
          package_id: number
          phase: string
          progress_percent: number
          risk_flags: Json
          tenant_id: number
        }[]
      }
      get_most_used_resources: {
        Args: { p_limit?: number }
        Returns: {
          access_level: string
          category: string
          created_at: string
          description: string
          file_url: string
          id: string
          is_favourite: boolean
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          version: string
          video_url: string
        }[]
      }
      get_package_stats: {
        Args: { p_package_id: number }
        Returns: {
          active_clients: number
          all_clients: number
        }[]
      }
      get_recently_added_resources: {
        Args: { p_limit?: number }
        Returns: {
          access_level: string
          category: string
          created_at: string
          description: string
          file_url: string
          id: string
          is_favourite: boolean
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          version: string
          video_url: string
        }[]
      }
      get_resources_by_category: {
        Args: { p_category: string }
        Returns: {
          access_level: string
          category: string
          created_at: string
          description: string
          file_url: string
          id: string
          is_favourite: boolean
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          version: string
          video_url: string
        }[]
      }
      get_stage_progress: {
        Args: never
        Returns: {
          active_count: number
          blocked_count: number
          completed_count: number
          current_stage_name: string
          current_stage_status: string
          package_id: number
          percent_complete: number
          tenant_id: number
          total_stages: number
        }[]
      }
      get_stage_version_diff: {
        Args: { p_version_from: string; p_version_to: string }
        Returns: Json
      }
      get_system_tenant_id: { Args: never; Returns: number }
      get_team_users: {
        Args: never
        Returns: {
          avatar_url: string
          disabled: boolean
          email: string
          first_name: string
          is_csc: boolean
          job_title: string
          last_name: string
          superadmin_level: string
          user_uuid: string
        }[]
      }
      get_tenant_csc_profiles: {
        Args: { p_tenant_id?: number }
        Returns: {
          availability_note: string
          avatar_url: string
          away_message: string
          bio: string
          booking_url: string
          cover_email: string
          cover_first_name: string
          cover_last_name: string
          cover_user_id: string
          email: string
          first_name: string
          is_primary: boolean
          job_title: string
          last_name: string
          leave_from: string
          leave_to: string
          linkedin_url: string
          phone: string
          public_holiday_region: string
          role_label: string
          timezone: string
          user_uuid: string
          working_days: Json
          working_hours: Json
        }[]
      }
      get_tenant_scope_items: {
        Args: { p_scope_type?: string; p_tenant_id: number }
        Returns: {
          code: string
          id: string
          is_superseded: boolean
          last_refreshed_at: string
          scope_type: string
          status: string
          superseded_by: string
          tga_data: Json
          title: string
        }[]
      }
      get_tenant_scope_sync_status: {
        Args: { p_tenant_id: number }
        Returns: Json
      }
      get_timezones: {
        Args: never
        Returns: {
          country_code: string
          label: string
          tz: string
          utc_offset_minutes: number
        }[]
      }
      get_user_audit: {
        Args: {
          p_role_filter?: string
          p_search?: string
          p_status_filter?: string
          p_tenant_filter?: number
        }
        Returns: {
          archived: boolean
          auth_user_exists: boolean
          computed_status: string
          created_at: string
          disabled: boolean
          email: string
          email_match: boolean
          first_name: string
          has_active_membership: boolean
          has_global_role: boolean
          has_parent_or_child: boolean
          invitation_state: string
          issues: string[]
          last_name: string
          last_sign_in_at: string
          tenant_id: number
          tenant_memberships_count: number
          tenant_name: string
          unicorn_role: string
          user_type: string
          user_uuid: string
        }[]
      }
      get_user_favourites: {
        Args: never
        Returns: {
          access_level: string
          category: string
          created_at: string
          description: string
          file_url: string
          id: string
          is_favourite: boolean
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          version: string
          video_url: string
        }[]
      }
      get_user_notification_prefs: { Args: never; Returns: Json }
      get_valid_vivacity_users: {
        Args: never
        Returns: {
          email: string
          first_name: string
          last_name: string
          unicorn_role: string
          user_type: string
          user_uuid: string
        }[]
      }
      go_to_previous_segment: {
        Args: { p_meeting_id: string }
        Returns: string
      }
      has_any_eos_role: {
        Args: { _tenant_id: number; _user_id: string }
        Returns: boolean
      }
      has_eos_role: {
        Args: {
          _role: Database["public"]["Enums"]["eos_role"]
          _tenant_id: number
          _user_id: string
        }
        Returns: boolean
      }
      has_meeting_role: {
        Args: { _meeting_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_tenant_access: { Args: { _tenant_id: number }; Returns: boolean }
      has_tenant_admin: { Args: { _tenant_id: number }; Returns: boolean }
      increment_rate_limit: {
        Args: { p_action_type: string; p_tenant_id: number }
        Returns: undefined
      }
      init_template_versions: { Args: never; Returns: undefined }
      invite_user: {
        Args: { p_email: string; p_role?: string; p_tenant_id: string }
        Returns: string
      }
      is_admin_or_team_leader: { Args: never; Returns: boolean }
      is_client_user: { Args: never; Returns: boolean }
      is_current_user_super_admin: { Args: never; Returns: boolean }
      is_eos_admin: {
        Args: { _tenant_id: number; _user_id: string }
        Returns: boolean
      }
      is_meeting_participant: {
        Args: { _meeting_id: string; _user_id: string }
        Returns: boolean
      }
      is_qc_signed: { Args: { _qc_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_stage_in_active_use: { Args: { p_stage_id: number }; Returns: boolean }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      is_super_admin_admin: { Args: never; Returns: boolean }
      is_super_admin_by_role: { Args: never; Returns: boolean }
      is_super_admin_member: { Args: never; Returns: boolean }
      is_super_admin_user: { Args: { p_user_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tenant_admin:
        | { Args: { _tenant_id: number; _user_id: string }; Returns: boolean }
        | { Args: { p_tenant_id: number }; Returns: boolean }
      is_tenant_admin_uuid: { Args: { p_tenant_id: string }; Returns: boolean }
      is_tenant_member: { Args: { p_tenant_id: number }; Returns: boolean }
      is_tenant_member_uuid: { Args: { p_tenant_id: string }; Returns: boolean }
      is_user_super_admin: { Args: { user_id: string }; Returns: boolean }
      is_vivacity: { Args: never; Returns: boolean }
      is_vivacity_super_admin: { Args: never; Returns: boolean }
      is_vivacity_team: { Args: { p_user_id?: string }; Returns: boolean }
      is_vivacity_user: { Args: never; Returns: boolean }
      list_meeting_summaries_for_client: {
        Args: { p_client_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          created_at: string
          id: string
          issues: Json
          meeting_date: string
          meeting_id: string
          meeting_title: string
          todos: Json
        }[]
      }
      lock_meeting_minutes: {
        Args: { p_meeting_id: string; p_reason?: string }
        Returns: undefined
      }
      mark_all_present: { Args: { p_meeting_id: string }; Returns: Json }
      normalize_company_key: { Args: { txt: string }; Returns: string }
      persist_tga_scope_items: {
        Args: { p_scope_items: Json; p_scope_type: string; p_tenant_id: number }
        Returns: Json
      }
      propose_chart_change: {
        Args: { p_draft_json: Json; p_meeting_id: string }
        Returns: string
      }
      propose_vto_change: {
        Args: { p_draft_json: Json; p_meeting_id: string }
        Returns: string
      }
      publish_document_version: {
        Args: { p_document_id: number; p_notes?: string }
        Returns: string
      }
      publish_stage_version: {
        Args: { p_notes?: string; p_stage_id: number }
        Returns: string
      }
      publish_vto: {
        Args: {
          p_core_focus: string
          p_core_values: Json
          p_issues_list: Json
          p_marketing_strategy: Json
          p_one_year_plan: string
          p_quarterly_rocks: Json
          p_ten_year_target: string
          p_tenant_id: number
          p_three_year_picture: string
        }
        Returns: string
      }
      qc_create_links: {
        Args: { p_links: Json; p_qc_id: string }
        Returns: string[]
      }
      qc_schedule: {
        Args: {
          p_manager_ids: string[]
          p_quarter_end: string
          p_quarter_start: string
          p_reviewee_id: string
          p_scheduled_at?: string
          p_template_id: string
        }
        Returns: string
      }
      qc_schedule_next: {
        Args: { p_current_qc_id: string; p_next_quarter_start?: string }
        Returns: string
      }
      qc_set_fit: {
        Args: {
          p_capacity: boolean
          p_gets_it: boolean
          p_notes?: string
          p_qc_id: string
          p_seat_id?: string
          p_wants_it: boolean
        }
        Returns: string
      }
      qc_sign: { Args: { p_qc_id: string; p_role: string }; Returns: boolean }
      qc_upsert_answer: {
        Args: {
          p_prompt_key: string
          p_qc_id: string
          p_section_key: string
          p_value_json: Json
        }
        Returns: string
      }
      record_resource_usage: {
        Args: { p_downloaded?: boolean; p_resource_id: string }
        Returns: undefined
      }
      reject_document_ai_suggestions: {
        Args: { p_document_id: number; p_reason?: string; p_user_id?: string }
        Returns: Json
      }
      release_documents_to_tenant: {
        Args: {
          p_document_ids: number[]
          p_package_id: number
          p_stage_id: number
          p_tenant_id: number
        }
        Returns: number
      }
      release_to_tenant: {
        Args: {
          p_confirm_override?: boolean
          p_confirm_phrase?: string
          p_stage_release_id: string
        }
        Returns: Json
      }
      remove_favourite: { Args: { p_resource_id: string }; Returns: undefined }
      remove_meeting_attendee: {
        Args: { p_meeting_id: string; p_user_id: string }
        Returns: boolean
      }
      request_stage_review: {
        Args: { p_reviewer_user_id: string; p_stage_release_id: string }
        Returns: Json
      }
      restore_minutes_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: string
      }
      restore_template_version: {
        Args: { p_restore_reason?: string; p_version_id: string }
        Returns: string
      }
      retry_failed_generation: {
        Args: { p_generated_document_id: string }
        Returns: Json
      }
      rpc_add_time_entry: {
        Args: {
          p_client_id: number
          p_date?: string
          p_duration_minutes: number
          p_is_billable?: boolean
          p_notes?: string
          p_package_id?: number
          p_stage_id?: number
          p_task_id?: string
          p_tenant_id: number
          p_work_type?: string
        }
        Returns: Json
      }
      rpc_apply_draft_suggestion: {
        Args: {
          p_apply_client?: boolean
          p_apply_package?: boolean
          p_draft_id: string
        }
        Returns: Json
      }
      rpc_bulk_discard_time_drafts: {
        Args: { p_draft_ids: string[] }
        Returns: Json
      }
      rpc_bulk_post_time_drafts: {
        Args: { p_draft_ids: string[] }
        Returns: Json
      }
      rpc_bulk_snooze_time_drafts: {
        Args: { p_draft_ids: string[]; p_until: string }
        Returns: Json
      }
      rpc_bulk_update_time_drafts: {
        Args: { p_draft_ids: string[]; p_fields: Json }
        Returns: Json
      }
      rpc_check_package_thresholds: {
        Args: { p_client_id: number; p_client_package_id: string }
        Returns: Json
      }
      rpc_create_action_item: {
        Args: {
          p_client_id: string
          p_description?: string
          p_due_date?: string
          p_owner_user_id?: string
          p_priority?: string
          p_recurrence_rule?: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_source?: string
          p_source_note_id?: string
          p_tenant_id: number
          p_title: string
        }
        Returns: Json
      }
      rpc_create_client_note: {
        Args: {
          p_client_id: string
          p_content: string
          p_is_pinned?: boolean
          p_note_type: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_tags?: string[]
          p_tenant_id: number
          p_title: string
        }
        Returns: Json
      }
      rpc_create_time_draft_from_event: {
        Args: { p_event_id: string }
        Returns: Json
      }
      rpc_discard_time_draft: { Args: { p_draft_id: string }; Returns: Json }
      rpc_dismiss_alert: { Args: { p_alert_id: string }; Returns: Json }
      rpc_dismiss_time_inbox_banner: { Args: never; Returns: Json }
      rpc_export_client_timeline: {
        Args: {
          p_client_id: number
          p_event_types?: string[]
          p_from_date?: string
          p_tenant_id: number
          p_to_date?: string
        }
        Returns: {
          body: string
          created_by: string
          creator_name: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          title: string
        }[]
      }
      rpc_get_client_time_rollup: {
        Args: { p_client_id: number; p_days?: number }
        Returns: Json
      }
      rpc_get_my_action_items: {
        Args: {
          p_include_overdue?: boolean
          p_status_filter?: string
          p_user_id: string
        }
        Returns: {
          action_item_id: string
          client_id: string
          client_name: string
          created_at: string
          description: string
          due_date: string
          is_overdue: boolean
          priority: string
          related_entity_id: string
          related_entity_type: string
          source: string
          status: string
          tenant_id: number
          title: string
        }[]
      }
      rpc_get_package_time_rollup: {
        Args: { p_client_id: number; p_days?: number; p_package_id: number }
        Returns: Json
      }
      rpc_get_package_usage: {
        Args: { p_client_id: number; p_client_package_id: string }
        Returns: Json
      }
      rpc_get_time_inbox_stats: { Args: never; Returns: Json }
      rpc_insert_timeline_event: {
        Args: {
          p_body?: string
          p_client_id: number
          p_created_by?: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_metadata?: Json
          p_occurred_at?: string
          p_tenant_id: number
          p_title: string
        }
        Returns: Json
      }
      rpc_list_time_drafts:
        | {
            Args: { p_from?: string; p_status?: string; p_to?: string }
            Returns: {
              calendar_event_id: string
              client_id: number
              client_name: string
              confidence: number
              created_at: string
              created_by: string
              event_end_at: string
              event_start_at: string
              event_title: string
              id: string
              is_billable: boolean
              last_viewed_at: string
              minutes: number
              notes: string
              package_id: number
              snoozed_until: string
              stage_id: number
              status: string
              suggestion: Json
              tenant_id: number
              updated_at: string
              work_date: string
              work_type: string
            }[]
          }
        | {
            Args: {
              p_from?: string
              p_overdue_only?: boolean
              p_status?: string
              p_to?: string
            }
            Returns: Json[]
          }
      rpc_log_document_activity: {
        Args: {
          p_activity_type: string
          p_actor_role?: string
          p_client_id: number
          p_document_id: number
          p_file_name: string
          p_metadata?: Json
          p_package_id: number
          p_stage_id: number
          p_tenant_id: number
        }
        Returns: Json
      }
      rpc_post_time_draft: { Args: { p_draft_id: string }; Returns: Json }
      rpc_run_time_draft_worker: {
        Args: { p_tenant_id?: number }
        Returns: Json
      }
      rpc_search_timeline_events: {
        Args: {
          p_client_id: number
          p_event_types?: string[]
          p_from_date?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_tenant_id: number
          p_to_date?: string
        }
        Returns: {
          body: string
          client_id: string
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          source: string
          tenant_id: number
          title: string
        }[]
      }
      rpc_set_action_item_status: {
        Args: { p_action_item_id: string; p_status: string }
        Returns: Json
      }
      rpc_snooze_time_draft: {
        Args: { p_draft_id: string; p_until: string }
        Returns: Json
      }
      rpc_start_timer: {
        Args: {
          p_client_id: number
          p_notes?: string
          p_package_id?: number
          p_stage_id?: number
          p_task_id?: string
          p_tenant_id: number
          p_work_type?: string
        }
        Returns: Json
      }
      rpc_stop_timer: { Args: never; Returns: Json }
      rpc_toggle_client_note_pin: {
        Args: { p_is_pinned: boolean; p_note_id: string }
        Returns: Json
      }
      rpc_update_client_note: {
        Args: { p_note_id: string; p_updates: Json }
        Returns: Json
      }
      rpc_update_time_draft: {
        Args: { p_draft_id: string; p_fields: Json }
        Returns: Json
      }
      save_meeting_minutes: {
        Args: {
          p_change_summary?: string
          p_meeting_id: string
          p_minutes_snapshot: Json
        }
        Returns: string
      }
      save_meeting_rating: {
        Args: { p_meeting_id: string; p_rating: number }
        Returns: Json
      }
      save_outcome_confirmation: {
        Args: {
          p_justification: string
          p_meeting_id: string
          p_outcome_type: string
        }
        Returns: Json
      }
      search_resources: {
        Args: { p_category?: string; p_search_term: string; p_tags?: string[] }
        Returns: {
          access_level: string
          category: string
          created_at: string
          description: string
          file_url: string
          id: string
          is_favourite: boolean
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          version: string
          video_url: string
        }[]
      }
      seed_default_meeting_templates: { Args: never; Returns: undefined }
      seed_default_qc_template: { Args: never; Returns: undefined }
      seed_meeting_attendees_from_roles: {
        Args: { p_meeting_id: string }
        Returns: number
      }
      seed_system_agenda_templates:
        | { Args: never; Returns: undefined }
        | { Args: { p_tenant_id: number }; Returns: undefined }
      set_active_tenant: { Args: { p_tenant_id: string }; Returns: boolean }
      set_issue_status: {
        Args: { p_issue_id: string; p_solution_text?: string; p_status: string }
        Returns: undefined
      }
      set_user_notification_prefs: { Args: { p_prefs: Json }; Returns: string }
      start_client_package: {
        Args: {
          p_assigned_csc_user_id?: string
          p_package_id: number
          p_tenant_id: number
        }
        Returns: string
      }
      start_meeting_instance: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      start_meeting_with_quorum_check: {
        Args: { p_meeting_id: string; p_override_reason?: string }
        Returns: Json
      }
      start_meeting_with_validation: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      sync_stage_template_to_packages: {
        Args: { p_stage_id: number }
        Returns: Json
      }
      tenant_has_package: {
        Args: { p_package_id: number; p_tenant_id: number }
        Returns: boolean
      }
      tga_get_client_data: { Args: { p_client_id: string }; Returns: Json }
      tga_get_sync_progress: { Args: { p_run_id: string }; Returns: Json }
      tga_get_tenant_data: { Args: { p_tenant_id: number }; Returns: Json }
      tga_health_check:
        | { Args: never; Returns: Json }
        | {
            Args: { p_sample_codes?: string[]; p_tenant_id: number }
            Returns: Json
          }
      tga_queue_sync: {
        Args: { p_codes: string[]; p_tenant_id: number }
        Returns: Json
      }
      tga_start_staged_sync: {
        Args: {
          p_rto_code: string
          p_tenant_id: number
          p_triggered_by?: string
        }
        Returns: Json
      }
      tga_sync_client: {
        Args: { p_client_id: string; p_rto_number?: string }
        Returns: Json
      }
      tga_sync_delta: { Args: { p_since?: string }; Returns: Json }
      tga_sync_full: { Args: never; Returns: Json }
      tga_sync_status: { Args: never; Returns: Json }
      tga_sync_tenant: {
        Args: { p_rto_number?: string; p_tenant_id: number }
        Returns: Json
      }
      tga_unlink_client: { Args: { p_client_id: string }; Returns: Json }
      toggle_favourite: { Args: { p_resource_id: string }; Returns: boolean }
      track_document_download: {
        Args: { p_release_id: string }
        Returns: undefined
      }
      transition_stage_state: {
        Args: {
          p_new_status: string
          p_reason?: string
          p_stage_state_id: number
          p_user_id?: string
        }
        Returns: Json
      }
      unlock_meeting_minutes: {
        Args: { p_meeting_id: string; p_reason: string }
        Returns: undefined
      }
      update_meeting_attendance: {
        Args: {
          p_meeting_id: string
          p_notes?: string
          p_status: Database["public"]["Enums"]["meeting_attendance_status"]
          p_user_id: string
        }
        Returns: Json
      }
      update_meeting_series: {
        Args: {
          p_duration_minutes?: number
          p_location?: string
          p_series_id: string
          p_start_time?: string
          p_template_id?: string
          p_template_version_id?: string
          p_title?: string
        }
        Returns: boolean
      }
      update_my_csc_profile: {
        Args: {
          p_availability_note?: string
          p_bio?: string
          p_booking_url?: string
          p_communication_pref?: string
          p_job_title?: string
          p_linkedin_url?: string
          p_phone?: string
          p_public_holiday_region?: string
          p_response_time_sla?: string
          p_timezone?: string
          p_working_days?: Json
          p_working_hours?: Json
        }
        Returns: Json
      }
      update_own_team_profile:
        | {
            Args: {
              p_availability_note?: string
              p_away_message?: string
              p_booking_url?: string
              p_cover_user_id?: string
              p_leave_from?: string
              p_leave_until?: string
              p_linkedin_url?: string
              p_public_holiday_region?: string
              p_working_days?: Json
              p_working_hours?: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_availability_note?: string
              p_away_message?: string
              p_bio?: string
              p_booking_url?: string
              p_cover_user_id?: string
              p_job_title?: string
              p_leave_from?: string
              p_leave_to?: string
              p_linkedin_url?: string
              p_phone?: string
              p_public_holiday_region?: string
              p_timezone?: string
              p_working_days?: Json
              p_working_hours?: Json
            }
            Returns: Json
          }
      update_review_status: {
        Args: { p_notes?: string; p_review_id: string; p_status: string }
        Returns: Json
      }
      update_stage_certification: {
        Args: {
          p_certified_notes?: string
          p_is_certified: boolean
          p_stage_id: number
        }
        Returns: Json
      }
      update_team_member_profile: {
        Args: {
          p_availability_note?: string
          p_away_message?: string
          p_booking_url?: string
          p_cover_user_id?: string
          p_leave_from?: string
          p_leave_until?: string
          p_linkedin_url?: string
          p_public_holiday_region?: string
          p_target_user_id: string
          p_working_days?: Json
          p_working_hours?: Json
        }
        Returns: Json
      }
      update_user_notification_prefs: {
        Args: { p_prefs: Json }
        Returns: string
      }
      upsert_excel_template_bindings: {
        Args: {
          p_detected_dropdowns: Json
          p_detected_tokens: Json
          p_document_id: number
        }
        Returns: string
      }
      user_has_tenant_access: {
        Args: { p_tenant_id: number }
        Returns: boolean
      }
      user_in_tenant: { Args: { p_tenant_id: number }; Returns: boolean }
      validate_document_readiness: {
        Args: { p_document_id: number; p_tenant_id?: number }
        Returns: Json
      }
      validate_excel_bindings: {
        Args: { p_document_id: number }
        Returns: Json
      }
      validate_meeting_agenda: {
        Args: { p_meeting_id: string }
        Returns: {
          error_message: string
          is_valid: boolean
          missing_segments: string[]
        }[]
      }
      validate_meeting_close: { Args: { p_meeting_id: string }; Returns: Json }
      validate_release_readiness: {
        Args: { p_document_ids: number[]; p_tenant_id?: number }
        Returns: Json
      }
    }
    Enums: {
      australian_state:
        | "NSW"
        | "VIC"
        | "QLD"
        | "WA"
        | "SA"
        | "TAS"
        | "ACT"
        | "NT"
      eos_function_type:
        | "leadership"
        | "operations"
        | "finance"
        | "delivery"
        | "support"
        | "sales_marketing"
      eos_issue_status:
        | "Open"
        | "Discussing"
        | "Solved"
        | "Archived"
        | "In Review"
        | "Actioning"
        | "Escalated"
        | "Closed"
      eos_meeting_role: "Leader" | "Member" | "Observer"
      eos_meeting_type:
        | "L10"
        | "Quarterly"
        | "Annual"
        | "Focus_Day"
        | "Custom"
        | "Same_Page"
      eos_participant_role: "Leader" | "Member" | "Observer"
      eos_rock_status:
        | "Not_Started"
        | "On_Track"
        | "At_Risk"
        | "Off_Track"
        | "Complete"
      eos_role:
        | "admin"
        | "facilitator"
        | "scribe"
        | "participant"
        | "client_viewer"
      eos_seat_role_type:
        | "visionary"
        | "integrator"
        | "leadership_team"
        | "functional_lead"
      eos_segment_type:
        | "Segue"
        | "Scorecard"
        | "Rocks"
        | "Headlines"
        | "Todos"
        | "IDS"
        | "Conclude"
      eos_todo_status: "Open" | "Complete" | "Cancelled"
      feature_flag: "eos_qc"
      invite_status: "INVITED" | "ACCEPTED" | "REVOKED" | "EXPIRED"
      meeting_attendance_status:
        | "invited"
        | "accepted"
        | "declined"
        | "attended"
        | "late"
        | "left_early"
        | "no_show"
      meeting_role:
        | "owner"
        | "attendee"
        | "guest"
        | "visionary"
        | "integrator"
        | "core_team"
      meeting_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "ready_to_close"
        | "closed"
        | "locked"
      meeting_type: "level_10" | "quarterly" | "annual"
      rock_type: "company" | "team" | "individual"
      sch_booking_status: "pending" | "confirmed" | "rescheduled" | "cancelled"
      segment_type:
        | "segue"
        | "scorecard"
        | "rocks"
        | "headlines"
        | "todos"
        | "ids"
        | "conclude"
      staff_team_type:
        | "none"
        | "business_growth"
        | "client_success"
        | "client_experience"
        | "software_development"
        | "leadership"
      stage_state:
        | "not_started"
        | "active"
        | "blocked"
        | "complete"
        | "not_applicable"
      task_status:
        | "backlog"
        | "not_started"
        | "in_progress"
        | "blocked"
        | "completed"
        | "cancelled"
      tenant_member_role:
        | "SUPER_ADMIN_ADMINISTRATOR"
        | "SUPER_ADMIN_TEAM_LEADER"
        | "SUPER_ADMIN_GENERAL"
        | "CLIENT_ADMIN"
        | "CLIENT_USER"
      tenant_role: "ADMIN" | "GENERAL_USER"
      unicorn_role:
        | "Super Admin"
        | "Admin"
        | "User"
        | "Team Leader"
        | "Team Member"
      user_type_enum:
        | "Vivacity"
        | "Client"
        | "Member"
        | "Client Parent"
        | "Client Child"
        | "Vivacity Team"
      vivacity_role: "SUPER_ADMIN" | "TEAM_LEADER" | "TEAM_MEMBER"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      australian_state: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
      eos_function_type: [
        "leadership",
        "operations",
        "finance",
        "delivery",
        "support",
        "sales_marketing",
      ],
      eos_issue_status: [
        "Open",
        "Discussing",
        "Solved",
        "Archived",
        "In Review",
        "Actioning",
        "Escalated",
        "Closed",
      ],
      eos_meeting_role: ["Leader", "Member", "Observer"],
      eos_meeting_type: [
        "L10",
        "Quarterly",
        "Annual",
        "Focus_Day",
        "Custom",
        "Same_Page",
      ],
      eos_participant_role: ["Leader", "Member", "Observer"],
      eos_rock_status: [
        "Not_Started",
        "On_Track",
        "At_Risk",
        "Off_Track",
        "Complete",
      ],
      eos_role: [
        "admin",
        "facilitator",
        "scribe",
        "participant",
        "client_viewer",
      ],
      eos_seat_role_type: [
        "visionary",
        "integrator",
        "leadership_team",
        "functional_lead",
      ],
      eos_segment_type: [
        "Segue",
        "Scorecard",
        "Rocks",
        "Headlines",
        "Todos",
        "IDS",
        "Conclude",
      ],
      eos_todo_status: ["Open", "Complete", "Cancelled"],
      feature_flag: ["eos_qc"],
      invite_status: ["INVITED", "ACCEPTED", "REVOKED", "EXPIRED"],
      meeting_attendance_status: [
        "invited",
        "accepted",
        "declined",
        "attended",
        "late",
        "left_early",
        "no_show",
      ],
      meeting_role: [
        "owner",
        "attendee",
        "guest",
        "visionary",
        "integrator",
        "core_team",
      ],
      meeting_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "ready_to_close",
        "closed",
        "locked",
      ],
      meeting_type: ["level_10", "quarterly", "annual"],
      rock_type: ["company", "team", "individual"],
      sch_booking_status: ["pending", "confirmed", "rescheduled", "cancelled"],
      segment_type: [
        "segue",
        "scorecard",
        "rocks",
        "headlines",
        "todos",
        "ids",
        "conclude",
      ],
      staff_team_type: [
        "none",
        "business_growth",
        "client_success",
        "client_experience",
        "software_development",
        "leadership",
      ],
      stage_state: [
        "not_started",
        "active",
        "blocked",
        "complete",
        "not_applicable",
      ],
      task_status: [
        "backlog",
        "not_started",
        "in_progress",
        "blocked",
        "completed",
        "cancelled",
      ],
      tenant_member_role: [
        "SUPER_ADMIN_ADMINISTRATOR",
        "SUPER_ADMIN_TEAM_LEADER",
        "SUPER_ADMIN_GENERAL",
        "CLIENT_ADMIN",
        "CLIENT_USER",
      ],
      tenant_role: ["ADMIN", "GENERAL_USER"],
      unicorn_role: [
        "Super Admin",
        "Admin",
        "User",
        "Team Leader",
        "Team Member",
      ],
      user_type_enum: [
        "Vivacity",
        "Client",
        "Member",
        "Client Parent",
        "Client Child",
        "Vivacity Team",
      ],
      vivacity_role: ["SUPER_ADMIN", "TEAM_LEADER", "TEAM_MEMBER"],
    },
  },
} as const
