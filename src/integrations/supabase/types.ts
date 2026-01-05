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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          clickup_enabled: boolean
          id: number
          updated_at: string
        }
        Insert: {
          clickup_enabled?: boolean
          id?: never
          updated_at?: string
        }
        Update: {
          clickup_enabled?: boolean
          id?: never
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
          {
            foreignKeyName: "audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            referencedRelation: "eos_meetings"
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
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inspection_selected_tenant_id_fkey"
            columns: ["selected_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inspection_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_inspection_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          {
            foreignKeyName: "audit_template_response_sets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        Relationships: [
          {
            foreignKeyName: "audit_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "calendar_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        Relationships: [
          {
            foreignKeyName: "clients_legacy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        Relationships: [
          {
            foreignKeyName: "connected_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          title: string
          unread_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          title: string
          unread_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
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
      ctstatus: {
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
      document_files: {
        Row: {
          created_at: string
          file_path: string
          id: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      document_instances: {
        Row: {
          created_at: string
          document_id: number | null
          id: string
          notes: string | null
          status: string | null
          tenant_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: number | null
          id?: string
          notes?: string | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: number | null
          id?: string
          notes?: string | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_instances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          checksum: string | null
          document_id: string | null
          id: string
          storage_path: string | null
          tenant_id: number | null
        }
        Insert: {
          checksum?: string | null
          document_id?: string | null
          id: string
          storage_path?: string | null
          tenant_id?: number | null
        }
        Update: {
          checksum?: string | null
          document_id?: string | null
          id?: string
          storage_path?: string | null
          tenant_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          created_by: string | null
          createdat: string | null
          description: string | null
          due_date: string | null
          file_names: string[] | null
          format: string | null
          id: number
          is_released: boolean | null
          isclientdoc: boolean | null
          package_id: number | null
          stage: number | null
          tenant_id: number | null
          title: string
          updated_at: string | null
          uploaded_files: string[] | null
          versiondate: string | null
          versionlastupdated: string | null
          versionnumber: number | null
          watermark: boolean | null
        }
        Insert: {
          category?: string | null
          created_by?: string | null
          createdat?: string | null
          description?: string | null
          due_date?: string | null
          file_names?: string[] | null
          format?: string | null
          id?: never
          is_released?: boolean | null
          isclientdoc?: boolean | null
          package_id?: number | null
          stage?: number | null
          tenant_id?: number | null
          title: string
          updated_at?: string | null
          uploaded_files?: string[] | null
          versiondate?: string | null
          versionlastupdated?: string | null
          versionnumber?: number | null
          watermark?: boolean | null
        }
        Update: {
          category?: string | null
          created_by?: string | null
          createdat?: string | null
          description?: string | null
          due_date?: string | null
          file_names?: string[] | null
          format?: string | null
          id?: never
          is_released?: boolean | null
          isclientdoc?: boolean | null
          package_id?: number | null
          stage?: number | null
          tenant_id?: number | null
          title?: string
          updated_at?: string | null
          uploaded_files?: string[] | null
          versiondate?: string | null
          versionlastupdated?: string | null
          versionnumber?: number | null
          watermark?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            foreignKeyName: "documents_notes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_notes_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_stages: {
        Row: {
          created_at: string
          created_by: string | null
          dashboard_visible: boolean | null
          description: string | null
          id: number
          short_name: string | null
          stage_type: string | null
          status: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dashboard_visible?: boolean | null
          description?: string | null
          id?: never
          short_name?: string | null
          stage_type?: string | null
          status?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dashboard_visible?: boolean | null
          description?: string | null
          id?: never
          short_name?: string | null
          stage_type?: string | null
          status?: string | null
          title?: string
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "documents_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "email_automation_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          subject: string
          updated_at: string
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
          subject: string
          updated_at?: string
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
          subject?: string
          updated_at?: string
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
      emailinstances: {
        Row: {
          bcc: string | null
          cc: string | null
          content: string | null
          email_id: number | null
          id: number
          is_sent: boolean
          sender_id: number | null
          sent_date: string | null
          stage_instance_id: number
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
          sender_id?: number | null
          sent_date?: string | null
          stage_instance_id: number
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
          sender_id?: number | null
          sent_date?: string | null
          stage_instance_id?: number
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
        }
        Relationships: [
          {
            foreignKeyName: "emails_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "eos_accountability_chart_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_agenda_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          segments: Json
          template_name: string
          tenant_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          segments?: Json
          template_name: string
          tenant_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          meeting_type?: Database["public"]["Enums"]["eos_meeting_type"]
          segments?: Json
          template_name?: string
          tenant_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eos_agenda_templates_tenant_id_fkey"
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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_issues: {
        Row: {
          assigned_to: string | null
          category: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          linked_rock_id: string | null
          meeting_id: string | null
          priority: number | null
          raised_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          solution: string | null
          solved_at: string | null
          status: Database["public"]["Enums"]["eos_issue_status"] | null
          tenant_id: number
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          linked_rock_id?: string | null
          meeting_id?: string | null
          priority?: number | null
          raised_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          solution?: string | null
          solved_at?: string | null
          status?: Database["public"]["Enums"]["eos_issue_status"] | null
          tenant_id: number
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          linked_rock_id?: string | null
          meeting_id?: string | null
          priority?: number | null
          raised_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          solution?: string | null
          solved_at?: string | null
          status?: Database["public"]["Enums"]["eos_issue_status"] | null
          tenant_id?: number
          title?: string
          updated_at?: string | null
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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            referencedRelation: "eos_meetings"
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
            referencedRelation: "eos_meetings"
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
            referencedRelation: "eos_meetings"
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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_meetings: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          headlines: Json | null
          id: string
          is_complete: boolean | null
          is_multi_client: boolean | null
          issues_discussed: string[] | null
          location: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          notes: string | null
          parent_meeting_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          rock_reviews: Json | null
          scheduled_date: string
          scorecard_data: Json | null
          tenant_id: number
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          headlines?: Json | null
          id?: string
          is_complete?: boolean | null
          is_multi_client?: boolean | null
          issues_discussed?: string[] | null
          location?: string | null
          meeting_type: Database["public"]["Enums"]["eos_meeting_type"]
          notes?: string | null
          parent_meeting_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          rock_reviews?: Json | null
          scheduled_date: string
          scorecard_data?: Json | null
          tenant_id: number
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          headlines?: Json | null
          id?: string
          is_complete?: boolean | null
          is_multi_client?: boolean | null
          issues_discussed?: string[] | null
          location?: string | null
          meeting_type?: Database["public"]["Enums"]["eos_meeting_type"]
          notes?: string | null
          parent_meeting_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          rock_reviews?: Json | null
          scheduled_date?: string
          scorecard_data?: Json | null
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
            foreignKeyName: "eos_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_meetings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          {
            foreignKeyName: "eos_qc_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        Relationships: [
          {
            foreignKeyName: "eos_qc_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          level: string | null
          owner_id: string | null
          priority: number | null
          quarter_end: string | null
          quarter_number: number
          quarter_start: string | null
          quarter_year: number
          status: Database["public"]["Enums"]["eos_rock_status"] | null
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
          level?: string | null
          owner_id?: string | null
          priority?: number | null
          quarter_end?: string | null
          quarter_number: number
          quarter_start?: string | null
          quarter_year: number
          status?: Database["public"]["Enums"]["eos_rock_status"] | null
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
          level?: string | null
          owner_id?: string | null
          priority?: number | null
          quarter_end?: string | null
          quarter_number?: number
          quarter_start?: string | null
          quarter_year?: number
          status?: Database["public"]["Enums"]["eos_rock_status"] | null
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
            foreignKeyName: "eos_rocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
        Relationships: [
          {
            foreignKeyName: "eos_scorecard_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "eos_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eos_todos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      eos_vto: {
        Row: {
          client_id: string | null
          core_values: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          one_year_goals: Json | null
          one_year_profit_target: number | null
          one_year_revenue_target: number | null
          proven_process: Json | null
          target_market: string | null
          ten_year_target: string | null
          tenant_id: number
          three_year_measurables: Json | null
          three_year_profit_target: number | null
          three_year_revenue_target: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          core_values?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          one_year_goals?: Json | null
          one_year_profit_target?: number | null
          one_year_revenue_target?: number | null
          proven_process?: Json | null
          target_market?: string | null
          ten_year_target?: string | null
          tenant_id: number
          three_year_measurables?: Json | null
          three_year_profit_target?: number | null
          three_year_revenue_target?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          core_values?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          one_year_goals?: Json | null
          one_year_profit_target?: number | null
          one_year_revenue_target?: number | null
          proven_process?: Json | null
          target_market?: string | null
          ten_year_target?: string | null
          tenant_id?: number
          three_year_measurables?: Json | null
          three_year_profit_target?: number | null
          three_year_revenue_target?: number | null
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
          {
            foreignKeyName: "eos_vto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            referencedRelation: "eos_meetings"
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
        Relationships: [
          {
            foreignKeyName: "membership_activity_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "membership_ai_suggestions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_ai_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_entitlements: {
        Row: {
          created_at: string
          csc_user_id: string | null
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
            foreignKeyName: "membership_entitlements_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        Relationships: [
          {
            foreignKeyName: "membership_notes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "membership_tasks_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "notification_schedule_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "notification_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_client_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date_offset: number | null
          id: string
          name: string
          order_number: number
          package_id: number
          stage_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          id?: string
          name: string
          order_number?: number
          package_id: number
          stage_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          id?: string
          name?: string
          order_number?: number
          package_id?: number
          stage_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_package_client_tasks_package"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
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
          client_id: number
          clo_id: number
          end_date: string | null
          id: number
          is_complete: boolean
          last_document_update_email: string | null
          package_id: number
          release_documents_office: boolean
          release_documents_pdf: boolean
          start_date: string
        }
        Insert: {
          client_id: number
          clo_id: number
          end_date?: string | null
          id?: number
          is_complete: boolean
          last_document_update_email?: string | null
          package_id: number
          release_documents_office?: boolean
          release_documents_pdf?: boolean
          start_date: string
        }
        Update: {
          client_id?: number
          clo_id?: number
          end_date?: string | null
          id?: number
          is_complete?: boolean
          last_document_update_email?: string | null
          package_id?: number
          release_documents_office?: boolean
          release_documents_pdf?: boolean
          start_date?: string
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
          id: string
          name: string
          order_number: number
          package_id: number
          stage_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          id?: string
          name: string
          order_number?: number
          package_id: number
          stage_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date_offset?: number | null
          id?: string
          name?: string
          order_number?: number
          package_id?: number
          stage_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_package_staff_tasks_package"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_package_staff_tasks_stage"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "package_workflow_logs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_workflow_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string | null
          details: string | null
          duration_months: number | null
          full_text: string | null
          id: number
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
          duration_months?: number | null
          full_text?: string | null
          id?: never
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
          duration_months?: number | null
          full_text?: string | null
          id?: never
          name?: string | null
          package_type?: string | null
          progress_mode?: string | null
          slug?: string | null
          status?: string
          total_hours?: number | null
        }
        Relationships: []
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
      profiles: {
        Row: {
          active_tenant_id: string | null
          auth_user_id: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          id: number
          role: string | null
          updated_at: string | null
          user_id: string | null
          userid: number | null
          username: string
        }
        Insert: {
          active_tenant_id?: string | null
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          id?: number
          role?: string | null
          updated_at?: string | null
          user_id?: string | null
          userid?: number | null
          username: string
        }
        Update: {
          active_tenant_id?: string | null
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          id?: number
          role?: string | null
          updated_at?: string | null
          user_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "reusable_audit_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      stage_instances: {
        Row: {
          completion_date: string
          id: number
          package_instance_id: number
          paid: boolean
          released_client_tasks: boolean
          released_client_tasks_date: string | null
          stage_id: number
          status: number
        }
        Insert: {
          completion_date: string
          id?: number
          package_instance_id: number
          paid: boolean
          released_client_tasks?: boolean
          released_client_tasks_date?: string | null
          stage_id: number
          status?: number
        }
        Update: {
          completion_date?: string
          id?: number
          package_instance_id?: number
          paid?: boolean
          released_client_tasks?: boolean
          released_client_tasks_date?: string | null
          stage_id?: number
          status?: number
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
          {
            foreignKeyName: "task_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            foreignKeyName: "tasks_tenants_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenants_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          longitude: number | null
          notes: string | null
          postcode: string | null
          state: string | null
          suburb: string | null
          tenant_id: string
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
          longitude?: number | null
          notes?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id: string
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
          longitude?: number | null
          notes?: string | null
          postcode?: string | null
          state?: string | null
          suburb?: string | null
          tenant_id?: string
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
        Relationships: [
          {
            foreignKeyName: "tenant_notes_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "tenant_stages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "documents_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: number
          id_uuid: string | null
          metadata: Json | null
          name: string
          package_added_at: string | null
          package_id: number | null
          package_ids: number[] | null
          risk_level: string | null
          slug: string
          stage_ids: number[] | null
          state: Database["public"]["Enums"]["australian_state"] | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          id_uuid?: string | null
          metadata?: Json | null
          name: string
          package_added_at?: string | null
          package_id?: number | null
          package_ids?: number[] | null
          risk_level?: string | null
          slug: string
          stage_ids?: number[] | null
          state?: Database["public"]["Enums"]["australian_state"] | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          id_uuid?: string | null
          metadata?: Json | null
          name?: string
          package_added_at?: string | null
          package_id?: number | null
          package_ids?: number[] | null
          risk_level?: string | null
          slug?: string
          stage_ids?: number[] | null
          state?: Database["public"]["Enums"]["australian_state"] | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
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
          created_at: string | null
          email: string
          expires_at: string
          first_name: string
          id: string
          invited_by: string | null
          last_name: string | null
          status: string
          tenant_id: number
          token_hash: string | null
          unicorn_role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          first_name?: string
          id?: string
          invited_by?: string | null
          last_name?: string | null
          status?: string
          tenant_id: number
          token_hash?: string | null
          unicorn_role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          first_name?: string
          id?: string
          invited_by?: string | null
          last_name?: string | null
          status?: string
          tenant_id?: number
          token_hash?: string | null
          unicorn_role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_notification_prefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          abn: string | null
          accountable_person: string | null
          accounting_system: string | null
          acn: string | null
          archived: boolean
          avatar_path: string | null
          avatar_updated_at: string | null
          avatar_url: string | null
          bio: string | null
          biography: string | null
          clickup_url: string | null
          client_id: string | null
          country: string | null
          created_at: string | null
          cricos_id: string | null
          disabled: boolean
          email: string
          email_address: string | null
          first_name: string
          head_office_address: string | null
          is_team: boolean | null
          job_title: string | null
          keap_url: string | null
          last_name: string
          last_new_client_tasks_email: string | null
          last_sign_in_at: string | null
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
          registration_end_date: string | null
          role: string | null
          rto_id: number | null
          rto_name: string | null
          state: number | null
          street_address: string | null
          street_number_and_name: string | null
          suburb: string | null
          tenant_id: number | null
          tenant_name: string | null
          timezone: string | null
          title: string | null
          training_facility_address: string | null
          TS: string | null
          unicorn_role: Database["public"]["Enums"]["unicorn_role"]
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type_enum"]
          user_uuid: string
          website: string | null
        }
        Insert: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          archived?: boolean
          avatar_path?: string | null
          avatar_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          biography?: string | null
          clickup_url?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string | null
          cricos_id?: string | null
          disabled?: boolean
          email: string
          email_address?: string | null
          first_name: string
          head_office_address?: string | null
          is_team?: boolean | null
          job_title?: string | null
          keap_url?: string | null
          last_name: string
          last_new_client_tasks_email?: string | null
          last_sign_in_at?: string | null
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
          registration_end_date?: string | null
          role?: string | null
          rto_id?: number | null
          rto_name?: string | null
          state?: number | null
          street_address?: string | null
          street_number_and_name?: string | null
          suburb?: string | null
          tenant_id?: number | null
          tenant_name?: string | null
          timezone?: string | null
          title?: string | null
          training_facility_address?: string | null
          TS?: string | null
          unicorn_role?: Database["public"]["Enums"]["unicorn_role"]
          updated_at?: string
          user_type: Database["public"]["Enums"]["user_type_enum"]
          user_uuid?: string
          website?: string | null
        }
        Update: {
          abn?: string | null
          accountable_person?: string | null
          accounting_system?: string | null
          acn?: string | null
          archived?: boolean
          avatar_path?: string | null
          avatar_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          biography?: string | null
          clickup_url?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string | null
          cricos_id?: string | null
          disabled?: boolean
          email?: string
          email_address?: string | null
          first_name?: string
          head_office_address?: string | null
          is_team?: boolean | null
          job_title?: string | null
          keap_url?: string | null
          last_name?: string
          last_new_client_tasks_email?: string | null
          last_sign_in_at?: string | null
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
          registration_end_date?: string | null
          role?: string | null
          rto_id?: number | null
          rto_name?: string | null
          state?: number | null
          street_address?: string | null
          street_number_and_name?: string | null
          suburb?: string | null
          tenant_id?: number | null
          tenant_name?: string | null
          timezone?: string | null
          title?: string | null
          training_facility_address?: string | null
          TS?: string | null
          unicorn_role?: Database["public"]["Enums"]["unicorn_role"]
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type_enum"]
          user_uuid?: string
          website?: string | null
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
    }
    Functions: {
      accept_ai_suggestion: {
        Args: { p_suggestion_id: string }
        Returns: string
      }
      accept_invite: { Args: { p_token: string }; Returns: Json }
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
      add_package_to_tenant: {
        Args: { p_package_id: number; p_tenant_id: number }
        Returns: undefined
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
      advance_segment: { Args: { p_meeting_id: string }; Returns: string }
      calculate_membership_health: {
        Args: { p_package_id: number; p_tenant_id: number }
        Returns: Json
      }
      can_access_qc: {
        Args: { _qc_id: string; _user_id: string }
        Returns: boolean
      }
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
      create_issue: {
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
      create_meeting_from_template: {
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
      create_recurring_meetings: {
        Args: { p_base_meeting_id: string; p_weeks_ahead?: number }
        Returns: string[]
      }
      create_tenant: {
        Args: { p_admin_email?: string; p_name: string; p_slug: string }
        Returns: string
      }
      create_todos_from_issue: {
        Args: { p_issue_id: string; p_todos: Json }
        Returns: string[]
      }
      current_tenant: { Args: never; Returns: string }
      current_user_email: { Args: never; Returns: string }
      current_user_tenant_ids: { Args: never; Returns: string[] }
      drop_rock_to_issue: { Args: { p_rock_id: string }; Returns: string }
      fn_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
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
      get_current_user_role: { Args: never; Returns: string }
      get_current_user_tenant: { Args: never; Returns: number }
      get_current_user_type: { Args: never; Returns: string }
      get_email_automation_stats: {
        Args: { p_tenant_id: number }
        Returns: Json
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
      is_super_admin: { Args: never; Returns: boolean }
      is_super_admin_by_role: { Args: never; Returns: boolean }
      is_super_admin_member: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { tid: number }; Returns: boolean }
      is_user_super_admin: { Args: { user_id: string }; Returns: boolean }
      is_vivacity: { Args: never; Returns: boolean }
      is_vivacity_super_admin: { Args: never; Returns: boolean }
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
      normalize_company_key: { Args: { txt: string }; Returns: string }
      propose_chart_change: {
        Args: { p_draft_json: Json; p_meeting_id: string }
        Returns: string
      }
      propose_vto_change: {
        Args: { p_draft_json: Json; p_meeting_id: string }
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
      remove_favourite: { Args: { p_resource_id: string }; Returns: undefined }
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
      set_active_tenant: { Args: { p_tenant_id: string }; Returns: boolean }
      set_issue_status: {
        Args: { p_issue_id: string; p_solution_text?: string; p_status: string }
        Returns: undefined
      }
      set_user_notification_prefs: { Args: { p_prefs: Json }; Returns: string }
      tenant_has_package: {
        Args: { p_package_id: number; p_tenant_id: number }
        Returns: boolean
      }
      toggle_favourite: { Args: { p_resource_id: string }; Returns: boolean }
      update_user_notification_prefs: {
        Args: { p_prefs: Json }
        Returns: string
      }
      user_in_tenant: { Args: { p_tenant_id: number }; Returns: boolean }
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
      eos_issue_status: "Open" | "Discussing" | "Solved" | "Archived"
      eos_meeting_role: "Leader" | "Member" | "Observer"
      eos_meeting_type: "L10" | "Quarterly" | "Annual" | "Focus_Day" | "Custom"
      eos_participant_role: "Leader" | "Member" | "Observer"
      eos_rock_status: "Not_Started" | "On_Track" | "Off_Track" | "Complete"
      eos_role:
        | "admin"
        | "facilitator"
        | "scribe"
        | "participant"
        | "client_viewer"
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
      meeting_status: "scheduled" | "in_progress" | "completed" | "cancelled"
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
      tenant_member_role:
        | "SUPER_ADMIN_ADMINISTRATOR"
        | "SUPER_ADMIN_TEAM_LEADER"
        | "SUPER_ADMIN_GENERAL"
        | "CLIENT_ADMIN"
        | "CLIENT_USER"
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
      eos_issue_status: ["Open", "Discussing", "Solved", "Archived"],
      eos_meeting_role: ["Leader", "Member", "Observer"],
      eos_meeting_type: ["L10", "Quarterly", "Annual", "Focus_Day", "Custom"],
      eos_participant_role: ["Leader", "Member", "Observer"],
      eos_rock_status: ["Not_Started", "On_Track", "Off_Track", "Complete"],
      eos_role: [
        "admin",
        "facilitator",
        "scribe",
        "participant",
        "client_viewer",
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
      meeting_status: ["scheduled", "in_progress", "completed", "cancelled"],
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
      tenant_member_role: [
        "SUPER_ADMIN_ADMINISTRATOR",
        "SUPER_ADMIN_TEAM_LEADER",
        "SUPER_ADMIN_GENERAL",
        "CLIENT_ADMIN",
        "CLIENT_USER",
      ],
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
    },
  },
} as const
