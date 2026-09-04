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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_document_access: {
        Row: {
          accessed_at: string | null
          document_id: string
          id: string
          query_id: string | null
          relevance_score: number | null
          user_id: string
        }
        Insert: {
          accessed_at?: string | null
          document_id: string
          id?: string
          query_id?: string | null
          relevance_score?: number | null
          user_id: string
        }
        Update: {
          accessed_at?: string | null
          document_id?: string
          id?: string
          query_id?: string | null
          relevance_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_document_access_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_document_access_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "analytics_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_queries: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          documents_referenced: number | null
          execution_time_ms: number | null
          id: string
          query_text: string
          response_length: number | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          documents_referenced?: number | null
          execution_time_ms?: number | null
          id?: string
          query_text: string
          response_length?: number | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          documents_referenced?: number | null
          execution_time_ms?: number | null
          id?: string
          query_text?: string
          response_length?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_queries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      application_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          ip_address: string | null
          level: string
          message: string
          session_id: string | null
          source: string
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          level: string
          message: string
          session_id?: string | null
          source: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          level?: string
          message?: string
          session_id?: string | null
          source?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          sources: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          sources?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
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
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content_text: string
          created_at: string
          document_id: string
          end_page: number
          id: string
          page_map: Json
          start_page: number
        }
        Insert: {
          chunk_index: number
          content_text: string
          created_at?: string
          document_id: string
          end_page: number
          id?: string
          page_map: Json
          start_page: number
        }
        Update: {
          chunk_index?: number
          content_text?: string
          created_at?: string
          document_id?: string
          end_page?: number
          id?: string
          page_map?: Json
          start_page?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_embeddings: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          page_number: number | null
          updated_at: string | null
        }
        Insert: {
          chunk_index: number
          chunk_text: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          updated_at?: string | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          page_number?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_enriched_metadata: {
        Row: {
          confidence_score: number | null
          creation_date: string | null
          detected_entities: Json | null
          document_id: string
          document_type: string | null
          extracted_at: string
          file_size_bytes: number | null
          file_type: string | null
          id: string
          keywords: string[] | null
          last_modified_date: string | null
          page_count: number | null
          priority_indicator: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          creation_date?: string | null
          detected_entities?: Json | null
          document_id: string
          document_type?: string | null
          extracted_at?: string
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          keywords?: string[] | null
          last_modified_date?: string | null
          page_count?: number | null
          priority_indicator?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          creation_date?: string | null
          detected_entities?: Json | null
          document_id?: string
          document_type?: string | null
          extracted_at?: string
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          keywords?: string[] | null
          last_modified_date?: string | null
          page_count?: number | null
          priority_indicator?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_enriched_metadata_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_markdown: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          docx_storage_path: string | null
          docx_updated_at: string | null
          docx_version: number
          id: string
          ocr_markdown: string | null
          ocr_model: string | null
          target_language: string | null
          translated_markdown: string | null
          translation_model: string | null
          updated_at: string
          wopi_lock: string | null
          wopi_lock_expires_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          docx_storage_path?: string | null
          docx_updated_at?: string | null
          docx_version?: number
          id?: string
          ocr_markdown?: string | null
          ocr_model?: string | null
          target_language?: string | null
          translated_markdown?: string | null
          translation_model?: string | null
          updated_at?: string
          wopi_lock?: string | null
          wopi_lock_expires_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          docx_storage_path?: string | null
          docx_updated_at?: string | null
          docx_version?: number
          id?: string
          ocr_markdown?: string | null
          ocr_model?: string | null
          target_language?: string | null
          translated_markdown?: string | null
          translation_model?: string | null
          updated_at?: string
          wopi_lock?: string | null
          wopi_lock_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_markdown_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_metadata: {
        Row: {
          created_at: string
          document_id: string
          field_id: string
          id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          document_id: string
          field_id: string
          id?: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          document_id?: string
          field_id?: string
          id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_metadata_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_metadata_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "metadata_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          error_message: string | null
          id: string
          max_retries: number
          metadata: Json | null
          priority: number
          retry_count: number
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_message?: string | null
          id?: string
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_message?: string | null
          id?: string
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signers: {
        Row: {
          created_at: string
          declined_reason: string | null
          id: string
          order_index: number
          signature_request_id: string
          signed_at: string | null
          signer_email: string
          signer_user_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          declined_reason?: string | null
          id?: string
          order_index?: number
          signature_request_id: string
          signed_at?: string | null
          signer_email: string
          signer_user_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          declined_reason?: string | null
          id?: string
          order_index?: number
          signature_request_id?: string
          signed_at?: string | null
          signer_email?: string
          signer_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signers_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      document_tags: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      document_taxonomies: {
        Row: {
          created_at: string
          document_id: string
          id: string
          taxonomy_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          taxonomy_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          taxonomy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_taxonomies_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_taxonomies_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string
          content: string | null
          created_at: string | null
          created_by: string
          description: string | null
          fields: Json | null
          id: string
          is_public: boolean | null
          name: string
          template_type: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category: string
          content?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          fields?: Json | null
          id?: string
          is_public?: boolean | null
          name: string
          template_type: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          fields?: Json | null
          id?: string
          is_public?: boolean | null
          name?: string
          template_type?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          change_description: string | null
          content_text: string | null
          created_at: string
          created_by: string
          document_id: string
          id: string
          mime_type: string | null
          original_filename: string
          sensitivity: string
          status: string
          storage_path: string
          summary: string | null
          title: string
          version_number: number
        }
        Insert: {
          change_description?: string | null
          content_text?: string | null
          created_at?: string
          created_by: string
          document_id: string
          id?: string
          mime_type?: string | null
          original_filename: string
          sensitivity?: string
          status?: string
          storage_path: string
          summary?: string | null
          title: string
          version_number: number
        }
        Update: {
          change_description?: string | null
          content_text?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          mime_type?: string | null
          original_filename?: string
          sensitivity?: string
          status?: string
          storage_path?: string
          summary?: string | null
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_text: string | null
          created_at: string | null
          created_by: string
          folder_id: string | null
          id: string
          is_editable: boolean | null
          mime_type: string | null
          original_filename: string
          page_map: Json | null
          sensitivity: string | null
          status: string | null
          storage_path: string
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content_text?: string | null
          created_at?: string | null
          created_by: string
          folder_id?: string | null
          id?: string
          is_editable?: boolean | null
          mime_type?: string | null
          original_filename: string
          page_map?: Json | null
          sensitivity?: string | null
          status?: string | null
          storage_path: string
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content_text?: string | null
          created_at?: string | null
          created_by?: string
          folder_id?: string | null
          id?: string
          is_editable?: boolean | null
          mime_type?: string | null
          original_filename?: string
          page_map?: Json | null
          sensitivity?: string | null
          status?: string | null
          storage_path?: string
          summary?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_access: {
        Row: {
          access_level: Database["public"]["Enums"]["folder_access_level"]
          created_at: string
          folder_id: string
          granted_by: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["folder_access_level"]
          created_at?: string
          folder_id: string
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["folder_access_level"]
          created_at?: string
          folder_id?: string
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_access_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          level: number | null
          name: string
          parent_id: string | null
          path: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          level?: number | null
          name: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          level?: number | null
          name?: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "user_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_field_definitions: {
        Row: {
          created_at: string
          created_by: string
          default_value: string | null
          display_order: number | null
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          label: string
          name: string
          options: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_value?: string | null
          display_order?: number | null
          field_type: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label: string
          name: string
          options?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_value?: string | null
          display_order?: number | null
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label?: string
          name?: string
          options?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      metadata_template_fields: {
        Row: {
          created_at: string
          display_order: number | null
          field_id: string
          id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          field_id: string
          id?: string
          template_id: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          field_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metadata_template_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "metadata_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metadata_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "metadata_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_audit: {
        Row: {
          action: string
          document_id: string
          from_folder_id: string | null
          id: string
          is_automatic: boolean
          metadata_snapshot: Json | null
          performed_at: string
          performed_by: string | null
          reason: string | null
          rule_id: string | null
          to_folder_id: string | null
        }
        Insert: {
          action: string
          document_id: string
          from_folder_id?: string | null
          id?: string
          is_automatic?: boolean
          metadata_snapshot?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          rule_id?: string | null
          to_folder_id?: string | null
        }
        Update: {
          action?: string
          document_id?: string
          from_folder_id?: string | null
          id?: string
          is_automatic?: boolean
          metadata_snapshot?: Json | null
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          rule_id?: string | null
          to_folder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_audit_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_from_folder_id_fkey"
            columns: ["from_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "organization_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_to_folder_id_fkey"
            columns: ["to_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_rules: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          target_folder_id: string | null
          updated_at: string
        }
        Insert: {
          conditions: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          target_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          target_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_rules_target_folder_id_fkey"
            columns: ["target_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_conversions: {
        Row: {
          completed_at: string | null
          converted_file_path: string | null
          created_at: string
          error_message: string | null
          id: string
          original_file_path: string
          original_filename: string
          page_count: number | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          converted_file_path?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          original_file_path: string
          original_filename: string
          page_count?: number | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          converted_file_path?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          original_file_path?: string
          original_filename?: string
          page_count?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      procurement_case_documents: {
        Row: {
          case_id: string
          created_at: string
          doc_type: string
          document_id: string
          id: string
          is_generated: boolean
          stage: Database["public"]["Enums"]["procurement_stage"]
          updated_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          case_id: string
          created_at?: string
          doc_type?: string
          document_id: string
          id?: string
          is_generated?: boolean
          stage: Database["public"]["Enums"]["procurement_stage"]
          updated_at?: string
          uploaded_by: string
          version?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          doc_type?: string
          document_id?: string
          id?: string
          is_generated?: boolean
          stage?: Database["public"]["Enums"]["procurement_stage"]
          updated_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_case_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_case_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["procurement_role"] | null
          case_id: string
          created_at: string
          details: Json | null
          id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["procurement_role"] | null
          case_id: string
          created_at?: string
          details?: Json | null
          id?: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["procurement_role"] | null
          case_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          stage?: Database["public"]["Enums"]["procurement_stage"]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_cases: {
        Row: {
          awarded_vendor_id: string | null
          case_no: string
          case_status: Database["public"]["Enums"]["procurement_case_status"]
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          department_id: string | null
          estimated_cost: number
          id: string
          rejection: Json | null
          requester_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          status_label: string
          title: string
          updated_at: string
        }
        Insert: {
          awarded_vendor_id?: string | null
          case_no?: string
          case_status?: Database["public"]["Enums"]["procurement_case_status"]
          closed_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          department_id?: string | null
          estimated_cost?: number
          id?: string
          rejection?: Json | null
          requester_id: string
          stage?: Database["public"]["Enums"]["procurement_stage"]
          status_label?: string
          title: string
          updated_at?: string
        }
        Update: {
          awarded_vendor_id?: string | null
          case_no?: string
          case_status?: Database["public"]["Enums"]["procurement_case_status"]
          closed_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          department_id?: string | null
          estimated_cost?: number
          id?: string
          rejection?: Json | null
          requester_id?: string
          stage?: Database["public"]["Enums"]["procurement_stage"]
          status_label?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_cases_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_clarifications: {
        Row: {
          author_id: string
          body: string
          case_id: string
          created_at: string
          from_stage: Database["public"]["Enums"]["procurement_stage"]
          id: string
          kind: Database["public"]["Enums"]["procurement_clarification_kind"]
          parent_id: string | null
          resolved_at: string | null
          to_stage: Database["public"]["Enums"]["procurement_stage"] | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          case_id: string
          created_at?: string
          from_stage: Database["public"]["Enums"]["procurement_stage"]
          id?: string
          kind?: Database["public"]["Enums"]["procurement_clarification_kind"]
          parent_id?: string | null
          resolved_at?: string | null
          to_stage?: Database["public"]["Enums"]["procurement_stage"] | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          case_id?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["procurement_stage"]
          id?: string
          kind?: Database["public"]["Enums"]["procurement_clarification_kind"]
          parent_id?: string | null
          resolved_at?: string | null
          to_stage?: Database["public"]["Enums"]["procurement_stage"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_clarifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_clarifications_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "procurement_clarifications"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_committee_members: {
        Row: {
          attended: boolean
          committee_id: string
          conflict_reason: string | null
          created_at: string
          designation: string | null
          findings: string | null
          has_conflict: boolean
          id: string
          is_chair: boolean
          review_status: string
          signed_at: string | null
          updated_at: string
          user_id: string
          voting_rights: boolean
        }
        Insert: {
          attended?: boolean
          committee_id: string
          conflict_reason?: string | null
          created_at?: string
          designation?: string | null
          findings?: string | null
          has_conflict?: boolean
          id?: string
          is_chair?: boolean
          review_status?: string
          signed_at?: string | null
          updated_at?: string
          user_id: string
          voting_rights?: boolean
        }
        Update: {
          attended?: boolean
          committee_id?: string
          conflict_reason?: string | null
          created_at?: string
          designation?: string | null
          findings?: string | null
          has_conflict?: boolean
          id?: string
          is_chair?: boolean
          review_status?: string
          signed_at?: string | null
          updated_at?: string
          user_id?: string
          voting_rights?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "procurement_committee_members_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "procurement_committees"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_committees: {
        Row: {
          case_id: string
          constituted_at: string
          created_at: string
          created_by: string | null
          cycle: number
          id: string
          kind: Database["public"]["Enums"]["procurement_committee_kind"]
          name: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          constituted_at?: string
          created_at?: string
          created_by?: string | null
          cycle?: number
          id?: string
          kind: Database["public"]["Enums"]["procurement_committee_kind"]
          name?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          constituted_at?: string
          created_at?: string
          created_by?: string | null
          cycle?: number
          id?: string
          kind?: Database["public"]["Enums"]["procurement_committee_kind"]
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_committees_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_lookups: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      procurement_permissions: {
        Row: {
          key: string
          label: string
          stage: string
        }
        Insert: {
          key: string
          label: string
          stage: string
        }
        Update: {
          key?: string
          label?: string
          stage?: string
        }
        Relationships: []
      }
      procurement_ref_counters: {
        Row: {
          last_no: number
          prefix: string
          year: number
        }
        Insert: {
          last_no?: number
          prefix: string
          year: number
        }
        Update: {
          last_no?: number
          prefix?: string
          year?: number
        }
        Relationships: []
      }
      procurement_return_paths: {
        Row: {
          from_stage: Database["public"]["Enums"]["procurement_stage"]
          to_stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Insert: {
          from_stage: Database["public"]["Enums"]["procurement_stage"]
          to_stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Update: {
          from_stage?: Database["public"]["Enums"]["procurement_stage"]
          to_stage?: Database["public"]["Enums"]["procurement_stage"]
        }
        Relationships: []
      }
      procurement_role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["procurement_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["procurement_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["procurement_role"]
        }
        Relationships: [
          {
            foreignKeyName: "procurement_role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "procurement_permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      procurement_role_stages: {
        Row: {
          role: Database["public"]["Enums"]["procurement_role"]
          stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Insert: {
          role: Database["public"]["Enums"]["procurement_role"]
          stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Update: {
          role?: Database["public"]["Enums"]["procurement_role"]
          stage?: Database["public"]["Enums"]["procurement_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "procurement_role_stages_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "procurement_stage_config"
            referencedColumns: ["stage"]
          },
        ]
      }
      procurement_stage_actions: {
        Row: {
          action: Database["public"]["Enums"]["procurement_action"]
          chair_only: boolean
          code: string
          description: string | null
          entry_status: string | null
          guard_function: string | null
          label: string
          permission: string
          requires_remarks: boolean
          requires_signature: boolean
          sort_order: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          target_stage: Database["public"]["Enums"]["procurement_stage"] | null
        }
        Insert: {
          action: Database["public"]["Enums"]["procurement_action"]
          chair_only?: boolean
          code: string
          description?: string | null
          entry_status?: string | null
          guard_function?: string | null
          label: string
          permission: string
          requires_remarks?: boolean
          requires_signature?: boolean
          sort_order?: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          target_stage?: Database["public"]["Enums"]["procurement_stage"] | null
        }
        Update: {
          action?: Database["public"]["Enums"]["procurement_action"]
          chair_only?: boolean
          code?: string
          description?: string | null
          entry_status?: string | null
          guard_function?: string | null
          label?: string
          permission?: string
          requires_remarks?: boolean
          requires_signature?: boolean
          sort_order?: number
          stage?: Database["public"]["Enums"]["procurement_stage"]
          target_stage?: Database["public"]["Enums"]["procurement_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_stage_actions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "procurement_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "procurement_stage_actions_stage_fkey"
            columns: ["stage"]
            isOneToOne: false
            referencedRelation: "procurement_stage_config"
            referencedColumns: ["stage"]
          },
        ]
      }
      procurement_stage_config: {
        Row: {
          entry_status: string
          escalation_role:
            | Database["public"]["Enums"]["procurement_role"]
            | null
          label: string
          mandatory: boolean
          sequence: number
          sla_hours: number | null
          stage: Database["public"]["Enums"]["procurement_stage"]
          updated_at: string
        }
        Insert: {
          entry_status: string
          escalation_role?:
            | Database["public"]["Enums"]["procurement_role"]
            | null
          label: string
          mandatory?: boolean
          sequence: number
          sla_hours?: number | null
          stage: Database["public"]["Enums"]["procurement_stage"]
          updated_at?: string
        }
        Update: {
          entry_status?: string
          escalation_role?:
            | Database["public"]["Enums"]["procurement_role"]
            | null
          label?: string
          mandatory?: boolean
          sequence?: number
          sla_hours?: number | null
          stage?: Database["public"]["Enums"]["procurement_stage"]
          updated_at?: string
        }
        Relationships: []
      }
      procurement_stage_history: {
        Row: {
          actor_id: string | null
          case_id: string
          entered_at: string
          from_stage: Database["public"]["Enums"]["procurement_stage"] | null
          id: string
          remarks: string | null
          status_label: string
          to_stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          entered_at?: string
          from_stage?: Database["public"]["Enums"]["procurement_stage"] | null
          id?: string
          remarks?: string | null
          status_label: string
          to_stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          entered_at?: string
          from_stage?: Database["public"]["Enums"]["procurement_stage"] | null
          id?: string
          remarks?: string | null
          status_label?: string
          to_stage?: Database["public"]["Enums"]["procurement_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "procurement_stage_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          designation: string | null
          id: string
          role: Database["public"]["Enums"]["procurement_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          designation?: string | null
          id?: string
          role: Database["public"]["Enums"]["procurement_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          designation?: string | null
          id?: string
          role?: Database["public"]["Enums"]["procurement_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_user_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          version: string
        }
        Insert: {
          applied_at?: string
          version: string
        }
        Update: {
          applied_at?: string
          version?: string
        }
        Relationships: []
      }
      signature_requests: {
        Row: {
          created_at: string
          document_id: string
          due_date: string | null
          id: string
          message: string | null
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          due_date?: string | null
          id?: string
          message?: string | null
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          due_date?: string | null
          id?: string
          message?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          created_at: string
          document_signer_id: string
          id: string
          ip_address: string | null
          signature_data: string
          signature_type: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          document_signer_id: string
          id?: string
          ip_address?: string | null
          signature_data: string
          signature_type: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          document_signer_id?: string
          id?: string
          ip_address?: string | null
          signature_data?: string
          signature_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_document_signer_id_fkey"
            columns: ["document_signer_id"]
            isOneToOne: false
            referencedRelation: "document_signers"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      taxonomies: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          level: number | null
          name: string
          parent_id: string | null
          path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          name: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          name?: string
          parent_id?: string | null
          path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "taxonomies"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_history: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          original_filename: string
          original_storage_path: string
          skipped_cells: number
          source_language: string
          target_language: string
          total_cells: number
          translated_cells: number
          translated_filename: string
          translated_storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          original_filename: string
          original_storage_path: string
          skipped_cells?: number
          source_language: string
          target_language: string
          total_cells?: number
          translated_cells?: number
          translated_filename: string
          translated_storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          original_filename?: string
          original_storage_path?: string
          skipped_cells?: number
          source_language?: string
          target_language?: string
          total_cells?: number
          translated_cells?: number
          translated_filename?: string
          translated_storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_messages: {
        Row: {
          content: string
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_read: boolean
          receiver_id: string
          replied_to_message_id: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          receiver_id: string
          replied_to_message_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          receiver_id?: string
          replied_to_message_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_messages_replied_to_message_id_fkey"
            columns: ["replied_to_message_id"]
            isOneToOne: false
            referencedRelation: "user_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wopi_tokens: {
        Row: {
          created_at: string
          document_id: string
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          expires_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wopi_tokens_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_signature_request: {
        Args: { _signature_request_id: string; _user_id: string }
        Returns: boolean
      }
      cleanup_expired_wopi_tokens: { Args: never; Returns: undefined }
      cleanup_old_logs: { Args: never; Returns: undefined }
      get_document_access_stats: {
        Args: { filter_user_id?: string; limit_count?: number }
        Returns: {
          access_count: number
          avg_relevance: number
          document_id: string
          document_title: string
          last_accessed: string
        }[]
      }
      get_folder_stats: {
        Args: { folder_id: string }
        Returns: {
          document_count: number
          total_size_bytes: number
        }[]
      }
      get_folder_tree:
        | {
            Args: { root_folder_id?: string; user_id?: string }
            Returns: {
              color: string
              created_at: string
              description: string
              document_count: number
              id: string
              level: number
              name: string
              parent_id: string
              path: string
              updated_at: string
            }[]
          }
        | {
            Args: {
              filter_category?: string
              root_folder_id?: string
              user_id?: string
            }
            Returns: {
              category: string
              color: string
              created_at: string
              description: string
              document_count: number
              id: string
              level: number
              name: string
              parent_id: string
              path: string
              updated_at: string
            }[]
          }
      get_popular_queries: {
        Args: { filter_user_id?: string; limit_count?: number }
        Returns: {
          avg_documents_referenced: number
          avg_response_length: number
          query_count: number
          query_text: string
        }[]
      }
      has_folder_access: {
        Args: {
          _folder_id: string
          _required_level?: Database["public"]["Enums"]["folder_access_level"]
          _user_id: string
        }
        Returns: boolean
      }
      has_procurement_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_procurement_role: {
        Args: {
          _role: Database["public"]["Enums"]["procurement_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_procurement_committee_chair: {
        Args: {
          _case_id: string
          _kind: Database["public"]["Enums"]["procurement_committee_kind"]
          _user_id: string
        }
        Returns: boolean
      }
      is_procurement_committee_member: {
        Args: {
          _case_id: string
          _kind?: Database["public"]["Enums"]["procurement_committee_kind"]
          _user_id: string
        }
        Returns: boolean
      }
      is_signer_for_request: {
        Args: {
          _signature_request_id: string
          _user_email: string
          _user_id: string
        }
        Returns: boolean
      }
      procurement_advance_stage: {
        Args: {
          _case_id: string
          _remarks?: string
          _status_label?: string
          _to_stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Returns: {
          awarded_vendor_id: string | null
          case_no: string
          case_status: Database["public"]["Enums"]["procurement_case_status"]
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          department_id: string | null
          estimated_cost: number
          id: string
          rejection: Json | null
          requester_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          status_label: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_available_actions: {
        Args: { _case_id: string }
        Returns: {
          action: Database["public"]["Enums"]["procurement_action"]
          chair_only: boolean
          code: string
          description: string | null
          entry_status: string | null
          guard_function: string | null
          label: string
          permission: string
          requires_remarks: boolean
          requires_signature: boolean
          sort_order: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          target_stage: Database["public"]["Enums"]["procurement_stage"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "procurement_stage_actions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      procurement_can_view_case: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      procurement_can_view_case_row: {
        Args: {
          _case_id: string
          _created_by: string
          _requester_id: string
          _stage: Database["public"]["Enums"]["procurement_stage"]
          _user_id: string
        }
        Returns: boolean
      }
      procurement_committee_kind_for_stage: {
        Args: { _stage: Database["public"]["Enums"]["procurement_stage"] }
        Returns: Database["public"]["Enums"]["procurement_committee_kind"]
      }
      procurement_log_event: {
        Args: {
          _action: string
          _case_id: string
          _details?: Json
          _stage: Database["public"]["Enums"]["procurement_stage"]
          _summary: string
        }
        Returns: string
      }
      procurement_may_take_action: {
        Args: {
          _action: Database["public"]["Tables"]["procurement_stage_actions"]["Row"]
          _case_id: string
          _stage: Database["public"]["Enums"]["procurement_stage"]
          _user_id: string
        }
        Returns: boolean
      }
      procurement_my_permissions: {
        Args: never
        Returns: {
          permission: string
        }[]
      }
      procurement_my_worklist: {
        Args: never
        Returns: {
          awarded_vendor_id: string | null
          case_no: string
          case_status: Database["public"]["Enums"]["procurement_case_status"]
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          department_id: string | null
          estimated_cost: number
          id: string
          rejection: Json | null
          requester_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          status_label: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "procurement_cases"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      procurement_next_ref: { Args: { _prefix: string }; Returns: string }
      procurement_record_decision: {
        Args: {
          _action_code: string
          _case_id: string
          _payload?: Json
          _remarks?: string
        }
        Returns: {
          awarded_vendor_id: string | null
          case_no: string
          case_status: Database["public"]["Enums"]["procurement_case_status"]
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          department_id: string | null
          estimated_cost: number
          id: string
          rejection: Json | null
          requester_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          status_label: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_reject_case: {
        Args: { _case_id: string; _remarks: string }
        Returns: {
          awarded_vendor_id: string | null
          case_no: string
          case_status: Database["public"]["Enums"]["procurement_case_status"]
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          department_id: string | null
          estimated_cost: number
          id: string
          rejection: Json | null
          requester_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          status_label: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_role_reaches_stage: {
        Args: {
          _stage: Database["public"]["Enums"]["procurement_stage"]
          _user_id: string
        }
        Returns: boolean
      }
      procurement_stage_counts: {
        Args: never
        Returns: {
          open_cases: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          total_value: number
        }[]
      }
      procurement_transition_allowed: {
        Args: {
          _from: Database["public"]["Enums"]["procurement_stage"]
          _to: Database["public"]["Enums"]["procurement_stage"]
        }
        Returns: boolean
      }
      search_documents_by_embedding: {
        Args: {
          filter_user_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_text: string
          document_id: string
          document_title: string
          page_number: number
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      folder_access_level: "view" | "edit" | "manage"
      procurement_action:
        | "submit"
        | "approve"
        | "forward"
        | "send_back"
        | "request_clarification"
        | "reject"
      procurement_case_status: "open" | "rejected" | "closed"
      procurement_clarification_kind: "question" | "send_back"
      procurement_committee_kind: "tec" | "dpc" | "pnc"
      procurement_role:
        | "proc_admin"
        | "purchase_head"
        | "requester"
        | "finance_user"
        | "purchase_officer"
        | "tec_chairman"
        | "tec_member"
        | "head_of_division"
        | "commercial_team"
        | "dpc_chairman"
        | "dpc_member"
        | "pnc_chairman"
        | "pnc_member"
        | "management_approver"
        | "po_officer"
        | "receipt_payment_officer"
      procurement_stage:
        | "draft"
        | "mpr"
        | "finance"
        | "tender"
        | "tec"
        | "commercial"
        | "cst"
        | "dpc"
        | "pnc"
        | "purchase_proposal"
        | "purchase_order"
        | "goods_receipt"
        | "payment_recommendation"
        | "closed"
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
      app_role: ["admin", "moderator", "user"],
      folder_access_level: ["view", "edit", "manage"],
      procurement_action: [
        "submit",
        "approve",
        "forward",
        "send_back",
        "request_clarification",
        "reject",
      ],
      procurement_case_status: ["open", "rejected", "closed"],
      procurement_clarification_kind: ["question", "send_back"],
      procurement_committee_kind: ["tec", "dpc", "pnc"],
      procurement_role: [
        "proc_admin",
        "purchase_head",
        "requester",
        "finance_user",
        "purchase_officer",
        "tec_chairman",
        "tec_member",
        "head_of_division",
        "commercial_team",
        "dpc_chairman",
        "dpc_member",
        "pnc_chairman",
        "pnc_member",
        "management_approver",
        "po_officer",
        "receipt_payment_officer",
      ],
      procurement_stage: [
        "draft",
        "mpr",
        "finance",
        "tender",
        "tec",
        "commercial",
        "cst",
        "dpc",
        "pnc",
        "purchase_proposal",
        "purchase_order",
        "goods_receipt",
        "payment_recommendation",
        "closed",
      ],
    },
  },
} as const
