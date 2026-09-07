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
      procurement_bidders: {
        Row: {
          amc_years: number | null
          bid_amount: number | null
          bid_amount_gross: number | null
          bid_reference: string | null
          bid_validity_days: number | null
          case_id: string
          created_at: string
          created_by: string | null
          currency: string
          delivery_days: number | null
          disqualified_reason: string | null
          emd_amount: number
          emd_instrument: string | null
          emd_received_at: string | null
          emd_settled_at: string | null
          emd_settlement_note: string | null
          emd_status: string
          gst_pct: number | null
          id: string
          msme_category: string | null
          payment_terms: string | null
          recorded_by: string | null
          remarks: string | null
          status: string
          submitted_at: string | null
          tec_decided_at: string | null
          tec_decided_by: string | null
          tec_note: string | null
          tec_qualified: boolean | null
          tender_id: string
          updated_at: string
          vendor_id: string
          warranty_months: number | null
        }
        Insert: {
          amc_years?: number | null
          bid_amount?: number | null
          bid_amount_gross?: number | null
          bid_reference?: string | null
          bid_validity_days?: number | null
          case_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_days?: number | null
          disqualified_reason?: string | null
          emd_amount?: number
          emd_instrument?: string | null
          emd_received_at?: string | null
          emd_settled_at?: string | null
          emd_settlement_note?: string | null
          emd_status?: string
          gst_pct?: number | null
          id?: string
          msme_category?: string | null
          payment_terms?: string | null
          recorded_by?: string | null
          remarks?: string | null
          status?: string
          submitted_at?: string | null
          tec_decided_at?: string | null
          tec_decided_by?: string | null
          tec_note?: string | null
          tec_qualified?: boolean | null
          tender_id: string
          updated_at?: string
          vendor_id: string
          warranty_months?: number | null
        }
        Update: {
          amc_years?: number | null
          bid_amount?: number | null
          bid_amount_gross?: number | null
          bid_reference?: string | null
          bid_validity_days?: number | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_days?: number | null
          disqualified_reason?: string | null
          emd_amount?: number
          emd_instrument?: string | null
          emd_received_at?: string | null
          emd_settled_at?: string | null
          emd_settlement_note?: string | null
          emd_status?: string
          gst_pct?: number | null
          id?: string
          msme_category?: string | null
          payment_terms?: string | null
          recorded_by?: string | null
          remarks?: string | null
          status?: string
          submitted_at?: string | null
          tec_decided_at?: string | null
          tec_decided_by?: string | null
          tec_note?: string | null
          tec_qualified?: boolean | null
          tender_id?: string
          updated_at?: string
          vendor_id?: string
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_bidders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_bidders_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "procurement_tenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_bidders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_boq_lines: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          delivery_note: string | null
          estimated_rate: number | null
          hsn_code: string | null
          id: string
          item_name: string
          line_amount: number | null
          line_no: number
          quantity: number
          specification: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          delivery_note?: string | null
          estimated_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_name: string
          line_amount?: number | null
          line_no: number
          quantity?: number
          specification?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          delivery_note?: string | null
          estimated_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_name?: string
          line_amount?: number | null
          line_no?: number
          quantity?: number
          specification?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_boq_lines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_budget_commitments: {
        Row: {
          amount: number
          budget_head_id: string
          case_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          budget_head_id: string
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          budget_head_id?: string
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_budget_commitments_budget_head_id_fkey"
            columns: ["budget_head_id"]
            isOneToOne: false
            referencedRelation: "procurement_budget_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_budget_commitments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_budget_heads: {
        Row: {
          active: boolean
          allocated: number
          category_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          fiscal_year: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allocated?: number
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          fiscal_year: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allocated?: number
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          fiscal_year?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_budget_heads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_budget_heads_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_case_documents: {
        Row: {
          bidder_id: string | null
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
          bidder_id?: string | null
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
          bidder_id?: string | null
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
            foreignKeyName: "procurement_case_documents_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
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
      procurement_case_signatures: {
        Row: {
          action_code: string
          case_id: string
          id: string
          image: string
          kind: string
          signed_at: string
          signer_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Insert: {
          action_code: string
          case_id: string
          id?: string
          image: string
          kind?: string
          signed_at?: string
          signer_id: string
          stage: Database["public"]["Enums"]["procurement_stage"]
        }
        Update: {
          action_code?: string
          case_id?: string
          id?: string
          image?: string
          kind?: string
          signed_at?: string
          signer_id?: string
          stage?: Database["public"]["Enums"]["procurement_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "procurement_case_signatures_case_id_fkey"
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
            foreignKeyName: "procurement_cases_awarded_vendor_id_fkey"
            columns: ["awarded_vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
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
      procurement_commercial: {
        Row: {
          case_id: string
          created_at: string
          quote_status: string
          ranking_basis: string
          revision: number
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          quote_status?: string
          ranking_basis?: string
          revision?: number
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          quote_status?: string
          ranking_basis?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_commercial_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_commercial_approvals: {
        Row: {
          actor_id: string | null
          case_id: string
          decided_at: string
          id: string
          kind: string
          remarks: string | null
          revision: number
          signature_id: string | null
          status: string
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          decided_at?: string
          id?: string
          kind: string
          remarks?: string | null
          revision?: number
          signature_id?: string | null
          status: string
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          decided_at?: string
          id?: string
          kind?: string
          remarks?: string | null
          revision?: number
          signature_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_commercial_approvals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_commercial_approvals_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "procurement_case_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_commercial_quotes: {
        Row: {
          base_price: number
          bidder_id: string
          case_id: string
          commercial_compliance: string
          created_at: string
          created_by: string | null
          discount: number
          evaluated_cost: number | null
          freight: number
          fully_priced: boolean
          gst_amount: number | null
          gst_pct: number
          id: string
          loading_amount: number
          loading_note: string | null
          other_charges: number
          price_source: string
          remarks: string | null
          schedule_captured_at: string | null
          schedule_issues: Json
          schedule_source: string | null
          stated_total: number | null
          taxable_value: number | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          bidder_id: string
          case_id: string
          commercial_compliance?: string
          created_at?: string
          created_by?: string | null
          discount?: number
          evaluated_cost?: number | null
          freight?: number
          fully_priced?: boolean
          gst_amount?: number | null
          gst_pct?: number
          id?: string
          loading_amount?: number
          loading_note?: string | null
          other_charges?: number
          price_source?: string
          remarks?: string | null
          schedule_captured_at?: string | null
          schedule_issues?: Json
          schedule_source?: string | null
          stated_total?: number | null
          taxable_value?: number | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          bidder_id?: string
          case_id?: string
          commercial_compliance?: string
          created_at?: string
          created_by?: string | null
          discount?: number
          evaluated_cost?: number | null
          freight?: number
          fully_priced?: boolean
          gst_amount?: number | null
          gst_pct?: number
          id?: string
          loading_amount?: number
          loading_note?: string | null
          other_charges?: number
          price_source?: string
          remarks?: string | null
          schedule_captured_at?: string | null
          schedule_issues?: Json
          schedule_source?: string | null
          stated_total?: number | null
          taxable_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_commercial_quotes_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: true
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_commercial_recommendation_history: {
        Row: {
          case_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_bidder_id: string | null
          new_outcome: string
          new_reason: string | null
          new_vendor_name: string | null
          previous_bidder_id: string | null
          previous_outcome: string | null
          previous_reason: string | null
          previous_vendor_name: string | null
          remarks: string | null
          version: number
        }
        Insert: {
          case_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_bidder_id?: string | null
          new_outcome: string
          new_reason?: string | null
          new_vendor_name?: string | null
          previous_bidder_id?: string | null
          previous_outcome?: string | null
          previous_reason?: string | null
          previous_vendor_name?: string | null
          remarks?: string | null
          version: number
        }
        Update: {
          case_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_bidder_id?: string | null
          new_outcome?: string
          new_reason?: string | null
          new_vendor_name?: string | null
          previous_bidder_id?: string | null
          previous_outcome?: string | null
          previous_reason?: string | null
          previous_vendor_name?: string | null
          remarks?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_commercial_recommendation_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_commercial_recommendations: {
        Row: {
          authority_reasons: string[]
          authority_required: boolean
          case_id: string
          computed_l1_bidder_id: string | null
          justification_reason: string | null
          justification_text: string | null
          outcome: string
          recommended_at: string
          recommended_bidder_id: string | null
          recommended_by: string | null
          remarks: string | null
          updated_at: string
          version: number
        }
        Insert: {
          authority_reasons?: string[]
          authority_required?: boolean
          case_id: string
          computed_l1_bidder_id?: string | null
          justification_reason?: string | null
          justification_text?: string | null
          outcome?: string
          recommended_at?: string
          recommended_bidder_id?: string | null
          recommended_by?: string | null
          remarks?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          authority_reasons?: string[]
          authority_required?: boolean
          case_id?: string
          computed_l1_bidder_id?: string | null
          justification_reason?: string | null
          justification_text?: string | null
          outcome?: string
          recommended_at?: string
          recommended_bidder_id?: string | null
          recommended_by?: string | null
          remarks?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_commercial_recommendatio_computed_l1_bidder_id_fkey"
            columns: ["computed_l1_bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_commercial_recommendatio_recommended_bidder_id_fkey"
            columns: ["recommended_bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_commercial_recommendations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
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
      procurement_corrigenda: {
        Row: {
          after_snapshot: Json
          before_snapshot: Json
          case_id: string
          category: string
          created_at: string
          detail: string | null
          id: string
          issued_by: string | null
          issued_on: string
          needs_finance_review: boolean
          new_bid_end_at: string | null
          notice_document_id: string | null
          notice_snapshot: Json | null
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          serial_no: number
          status: string
          tender_id: string
          title: string
          updated_at: string
          value_after: number | null
          value_before: number | null
          value_delta: number | null
        }
        Insert: {
          after_snapshot?: Json
          before_snapshot?: Json
          case_id: string
          category: string
          created_at?: string
          detail?: string | null
          id?: string
          issued_by?: string | null
          issued_on?: string
          needs_finance_review?: boolean
          new_bid_end_at?: string | null
          notice_document_id?: string | null
          notice_snapshot?: Json | null
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          serial_no: number
          status?: string
          tender_id: string
          title: string
          updated_at?: string
          value_after?: number | null
          value_before?: number | null
          value_delta?: number | null
        }
        Update: {
          after_snapshot?: Json
          before_snapshot?: Json
          case_id?: string
          category?: string
          created_at?: string
          detail?: string | null
          id?: string
          issued_by?: string | null
          issued_on?: string
          needs_finance_review?: boolean
          new_bid_end_at?: string | null
          notice_document_id?: string | null
          notice_snapshot?: Json | null
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          serial_no?: number
          status?: string
          tender_id?: string
          title?: string
          updated_at?: string
          value_after?: number | null
          value_before?: number | null
          value_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_corrigenda_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_corrigenda_notice_document_id_fkey"
            columns: ["notice_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_corrigenda_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "procurement_tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_corrigendum_notices: {
        Row: {
          channel: string
          corrigendum_id: string
          created_at: string
          id: string
          note: string | null
          notified_at: string
          notified_by: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          channel?: string
          corrigendum_id: string
          created_at?: string
          id?: string
          note?: string | null
          notified_at?: string
          notified_by?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          channel?: string
          corrigendum_id?: string
          created_at?: string
          id?: string
          note?: string | null
          notified_at?: string
          notified_by?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_corrigendum_notices_corrigendum_id_fkey"
            columns: ["corrigendum_id"]
            isOneToOne: false
            referencedRelation: "procurement_corrigenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_corrigendum_notices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_cst_scrutiny: {
        Row: {
          case_id: string
          item_key: string
          remarks: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          case_id: string
          item_key: string
          remarks?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          case_id?: string
          item_key?: string
          remarks?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_cst_scrutiny_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_cst_versions: {
        Row: {
          case_id: string
          compiled_at: string | null
          compiled_by: string | null
          computed_l1_bidder_id: string | null
          created_at: string
          generated_on: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          ranking_basis: string | null
          reopen_reason: string | null
          signature_id: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          snapshot: Json | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          case_id: string
          compiled_at?: string | null
          compiled_by?: string | null
          computed_l1_bidder_id?: string | null
          created_at?: string
          generated_on?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          ranking_basis?: string | null
          reopen_reason?: string | null
          signature_id?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          snapshot?: Json | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          case_id?: string
          compiled_at?: string | null
          compiled_by?: string | null
          computed_l1_bidder_id?: string | null
          created_at?: string
          generated_on?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          ranking_basis?: string | null
          reopen_reason?: string | null
          signature_id?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          snapshot?: Json | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_cst_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cst_versions_computed_l1_bidder_id_fkey"
            columns: ["computed_l1_bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_cst_versions_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "procurement_case_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_goods_receipts: {
        Row: {
          case_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          cycle: number
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          case_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          cycle: number
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          cycle?: number
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_goods_receipts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_grn_lines: {
        Row: {
          accepted_qty: number
          accepted_value: number | null
          case_id: string
          created_at: string
          delivered_qty: number
          discrepancy_reason: string | null
          grn_id: string
          id: string
          item_name: string
          line_no: number
          ordered_qty: number
          previously_accepted_qty: number
          rejected_qty: number
          unit: string | null
          unit_rate: number
          updated_at: string
        }
        Insert: {
          accepted_qty?: number
          accepted_value?: number | null
          case_id: string
          created_at?: string
          delivered_qty?: number
          discrepancy_reason?: string | null
          grn_id: string
          id?: string
          item_name?: string
          line_no?: number
          ordered_qty?: number
          previously_accepted_qty?: number
          rejected_qty?: number
          unit?: string | null
          unit_rate?: number
          updated_at?: string
        }
        Update: {
          accepted_qty?: number
          accepted_value?: number | null
          case_id?: string
          created_at?: string
          delivered_qty?: number
          discrepancy_reason?: string | null
          grn_id?: string
          id?: string
          item_name?: string
          line_no?: number
          ordered_qty?: number
          previously_accepted_qty?: number
          rejected_qty?: number
          unit?: string | null
          unit_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "procurement_goods_receipts"
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
      procurement_negotiation_rounds: {
        Row: {
          case_id: string
          closed_at: string | null
          committee_counter_offer: number | null
          conducted_by: string | null
          created_at: string
          created_by: string | null
          delivery_days: number | null
          final_offer: number | null
          id: string
          notes: string | null
          override_reason: string | null
          payment_terms: string | null
          round_date: string
          round_no: number
          status: string
          updated_at: string
          vendor_offer: number
          warranty_months: number | null
        }
        Insert: {
          case_id: string
          closed_at?: string | null
          committee_counter_offer?: number | null
          conducted_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          final_offer?: number | null
          id?: string
          notes?: string | null
          override_reason?: string | null
          payment_terms?: string | null
          round_date?: string
          round_no: number
          status?: string
          updated_at?: string
          vendor_offer: number
          warranty_months?: number | null
        }
        Update: {
          case_id?: string
          closed_at?: string | null
          committee_counter_offer?: number | null
          conducted_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          final_offer?: number | null
          id?: string
          notes?: string | null
          override_reason?: string | null
          payment_terms?: string | null
          round_date?: string
          round_no?: number
          status?: string
          updated_at?: string
          vendor_offer?: number
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_negotiation_rounds_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_negotiations"
            referencedColumns: ["case_id"]
          },
        ]
      }
      procurement_negotiations: {
        Row: {
          bidder_id: string | null
          case_id: string
          concluded_at: string | null
          concluded_by: string | null
          created_at: string
          created_by: string | null
          final_delivery_days: number | null
          final_payment_terms: string | null
          final_price: number | null
          final_warranty_months: number | null
          mandate_instructions: string | null
          mandate_reason: string
          objectives: string[]
          opening_offer: number | null
          status: string
          updated_at: string
        }
        Insert: {
          bidder_id?: string | null
          case_id: string
          concluded_at?: string | null
          concluded_by?: string | null
          created_at?: string
          created_by?: string | null
          final_delivery_days?: number | null
          final_payment_terms?: string | null
          final_price?: number | null
          final_warranty_months?: number | null
          mandate_instructions?: string | null
          mandate_reason?: string
          objectives?: string[]
          opening_offer?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          bidder_id?: string | null
          case_id?: string
          concluded_at?: string | null
          concluded_by?: string | null
          created_at?: string
          created_by?: string | null
          final_delivery_days?: number | null
          final_payment_terms?: string | null
          final_price?: number | null
          final_warranty_months?: number | null
          mandate_instructions?: string | null
          mandate_reason?: string
          objectives?: string[]
          opening_offer?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_negotiations_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_negotiations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_payment_ai_drafts: {
        Row: {
          case_id: string
          generated_at: string
          model: string | null
          recommendation_note: string | null
          requested_by: string | null
        }
        Insert: {
          case_id: string
          generated_at?: string
          model?: string | null
          recommendation_note?: string | null
          requested_by?: string | null
        }
        Update: {
          case_id?: string
          generated_at?: string
          model?: string | null
          recommendation_note?: string | null
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_payment_ai_drafts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_payment_recommendations"
            referencedColumns: ["case_id"]
          },
        ]
      }
      procurement_payment_recommendations: {
        Row: {
          accepted_value: number
          case_id: string
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          invoice_amount: number
          invoice_date: string | null
          invoice_number: string | null
          penalty_deductions: number
          recommended_amount: number | null
          remarks: string | null
          status: string
          updated_at: string
          voucher_date: string | null
          voucher_number: string | null
        }
        Insert: {
          accepted_value?: number
          case_id: string
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string | null
          invoice_amount?: number
          invoice_date?: string | null
          invoice_number?: string | null
          penalty_deductions?: number
          recommended_amount?: number | null
          remarks?: string | null
          status?: string
          updated_at?: string
          voucher_date?: string | null
          voucher_number?: string | null
        }
        Update: {
          accepted_value?: number
          case_id?: string
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string | null
          invoice_amount?: number
          invoice_date?: string | null
          invoice_number?: string | null
          penalty_deductions?: number
          recommended_amount?: number | null
          remarks?: string | null
          status?: string
          updated_at?: string
          voucher_date?: string | null
          voucher_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_payment_recommendations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
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
      procurement_po_ai_drafts: {
        Row: {
          case_id: string
          delivery_terms_draft: string | null
          generated_at: string
          model: string | null
          payment_terms_draft: string | null
          requested_by: string | null
          special_conditions_draft: string | null
          warranty_clause_draft: string | null
        }
        Insert: {
          case_id: string
          delivery_terms_draft?: string | null
          generated_at?: string
          model?: string | null
          payment_terms_draft?: string | null
          requested_by?: string | null
          special_conditions_draft?: string | null
          warranty_clause_draft?: string | null
        }
        Update: {
          case_id?: string
          delivery_terms_draft?: string | null
          generated_at?: string
          model?: string | null
          payment_terms_draft?: string | null
          requested_by?: string | null
          special_conditions_draft?: string | null
          warranty_clause_draft?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_po_ai_drafts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_purchase_orders"
            referencedColumns: ["case_id"]
          },
        ]
      }
      procurement_po_amendments: {
        Row: {
          amended_at: string
          amended_by: string | null
          case_id: string
          changes: Json
          id: string
          reason: string
          version: number
        }
        Insert: {
          amended_at?: string
          amended_by?: string | null
          case_id: string
          changes?: Json
          id?: string
          reason: string
          version: number
        }
        Update: {
          amended_at?: string
          amended_by?: string | null
          case_id?: string
          changes?: Json
          id?: string
          reason?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_po_amendments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_purchase_orders"
            referencedColumns: ["case_id"]
          },
        ]
      }
      procurement_po_lines: {
        Row: {
          case_id: string
          created_at: string
          gst_pct: number
          id: string
          item_name: string
          line_amount: number | null
          line_no: number
          quantity: number
          unit: string | null
          unit_rate: number
        }
        Insert: {
          case_id: string
          created_at?: string
          gst_pct?: number
          id?: string
          item_name?: string
          line_amount?: number | null
          line_no?: number
          quantity?: number
          unit?: string | null
          unit_rate?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          gst_pct?: number
          id?: string
          item_name?: string
          line_amount?: number | null
          line_no?: number
          quantity?: number
          unit?: string | null
          unit_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_po_lines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_purchase_orders"
            referencedColumns: ["case_id"]
          },
        ]
      }
      procurement_purchase_orders: {
        Row: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        Insert: {
          billing_address?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_terms?: string | null
          issued_at?: string | null
          issued_by?: string | null
          payment_terms?: string | null
          penalty_clause?: string | null
          po_no: string
          recommended_bidder_id?: string | null
          special_conditions?: string | null
          status?: string
          total_value?: number | null
          updated_at?: string
          vendor_ack_note?: string | null
          vendor_ack_recorded_at?: string | null
          vendor_ack_recorded_by?: string | null
          vendor_ack_status?: string
          version?: number
          warranty_months?: number | null
        }
        Update: {
          billing_address?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_terms?: string | null
          issued_at?: string | null
          issued_by?: string | null
          payment_terms?: string | null
          penalty_clause?: string | null
          po_no?: string
          recommended_bidder_id?: string | null
          special_conditions?: string | null
          status?: string
          total_value?: number | null
          updated_at?: string
          vendor_ack_note?: string | null
          vendor_ack_recorded_at?: string | null
          vendor_ack_recorded_by?: string | null
          vendor_ack_status?: string
          version?: number
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_purchase_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_purchase_orders_recommended_bidder_id_fkey"
            columns: ["recommended_bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_purchase_proposals: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          delivery_days: number | null
          negotiated_price: number | null
          original_evaluated_cost: number | null
          payment_terms: string | null
          recommendation_note: string
          recommended_bidder_id: string | null
          updated_at: string
          warranty_months: number | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          negotiated_price?: number | null
          original_evaluated_cost?: number | null
          payment_terms?: string | null
          recommendation_note?: string
          recommended_bidder_id?: string | null
          updated_at?: string
          warranty_months?: number | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          negotiated_price?: number | null
          original_evaluated_cost?: number | null
          payment_terms?: string | null
          recommendation_note?: string
          recommended_bidder_id?: string | null
          updated_at?: string
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_purchase_proposals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_purchase_proposals_recommended_bidder_id_fkey"
            columns: ["recommended_bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_quote_lines: {
        Row: {
          case_id: string
          created_at: string
          id: string
          item_name: string
          line_amount: number | null
          line_no: number
          note: string | null
          quantity: number
          quote_id: string
          quoted_quantity: number | null
          stated_amount: number | null
          tender_item_id: string
          unit: string | null
          unit_rate: number | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          item_name?: string
          line_amount?: number | null
          line_no?: number
          note?: string | null
          quantity?: number
          quote_id: string
          quoted_quantity?: number | null
          stated_amount?: number | null
          tender_item_id: string
          unit?: string | null
          unit_rate?: number | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          item_name?: string
          line_amount?: number | null
          line_no?: number
          note?: string | null
          quantity?: number
          quote_id?: string
          quoted_quantity?: number | null
          stated_amount?: number | null
          tender_item_id?: string
          unit?: string | null
          unit_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "procurement_commercial_quotes"
            referencedColumns: ["id"]
          },
        ]
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
      procurement_requisitions: {
        Row: {
          budget_head_id: string | null
          case_id: string
          category_id: string | null
          cost_centre_id: string | null
          cost_source: string
          created_at: string
          created_by: string | null
          delivery_note: string | null
          id: string
          justification: string | null
          manual_cost: number
          priority_id: string | null
          procurement_type_id: string | null
          required_by: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          budget_head_id?: string | null
          case_id: string
          category_id?: string | null
          cost_centre_id?: string | null
          cost_source?: string
          created_at?: string
          created_by?: string | null
          delivery_note?: string | null
          id?: string
          justification?: string | null
          manual_cost?: number
          priority_id?: string | null
          procurement_type_id?: string | null
          required_by?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          budget_head_id?: string | null
          case_id?: string
          category_id?: string | null
          cost_centre_id?: string | null
          cost_source?: string
          created_at?: string
          created_by?: string | null
          delivery_note?: string | null
          id?: string
          justification?: string | null
          manual_cost?: number
          priority_id?: string | null
          procurement_type_id?: string | null
          required_by?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requisitions_budget_head_id_fkey"
            columns: ["budget_head_id"]
            isOneToOne: false
            referencedRelation: "procurement_budget_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requisitions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requisitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requisitions_cost_centre_id_fkey"
            columns: ["cost_centre_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requisitions_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requisitions_procurement_type_id_fkey"
            columns: ["procurement_type_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requisitions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "procurement_lookups"
            referencedColumns: ["id"]
          },
        ]
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
      procurement_signatures: {
        Row: {
          created_at: string
          image: string
          kind: string
          updated_at: string
          use_by_default: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          image: string
          kind?: string
          updated_at?: string
          use_by_default?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          image?: string
          kind?: string
          updated_at?: string
          use_by_default?: boolean
          user_id?: string
        }
        Relationships: []
      }
      procurement_stage_actions: {
        Row: {
          action: Database["public"]["Enums"]["procurement_action"]
          chair_only: boolean
          code: string
          description: string | null
          entry_status: string | null
          gaps_function: string | null
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
          gaps_function?: string | null
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
          gaps_function?: string | null
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
      procurement_tec_ai_suggestions: {
        Row: {
          bidder_id: string
          case_id: string
          compliance_status: string
          created_at: string
          evidence: Json
          generated_at: string
          model: string | null
          qualified: boolean | null
          requested_by: string | null
          score: number | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          bidder_id: string
          case_id: string
          compliance_status?: string
          created_at?: string
          evidence?: Json
          generated_at?: string
          model?: string | null
          qualified?: boolean | null
          requested_by?: string | null
          score?: number | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          bidder_id?: string
          case_id?: string
          compliance_status?: string
          created_at?: string
          evidence?: Json
          generated_at?: string
          model?: string | null
          qualified?: boolean | null
          requested_by?: string | null
          score?: number | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_tec_ai_suggestions_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: true
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_tec_checklist: {
        Row: {
          case_id: string
          item_key: string
          remarks: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_id: string
          item_key: string
          remarks?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_id?: string
          item_key?: string
          remarks?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_tec_checklist_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_tec_evaluations: {
        Row: {
          bidder_id: string
          case_id: string
          compliance_status: string
          created_at: string
          id: string
          member_id: string
          qualified: boolean | null
          remarks: string | null
          score: number | null
          signature_id: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          bidder_id: string
          case_id: string
          compliance_status?: string
          created_at?: string
          id?: string
          member_id: string
          qualified?: boolean | null
          remarks?: string | null
          score?: number | null
          signature_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          bidder_id?: string
          case_id?: string
          compliance_status?: string
          created_at?: string
          id?: string
          member_id?: string
          qualified?: boolean | null
          remarks?: string | null
          score?: number | null
          signature_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_tec_evaluations_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "procurement_bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_tec_evaluations_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "procurement_case_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_tender_invitees: {
        Row: {
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          note: string | null
          tender_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          tender_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          tender_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_tender_invitees_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "procurement_tenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_tender_invitees_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_tender_items: {
        Row: {
          created_at: string
          estimated_rate: number | null
          hsn_code: string | null
          id: string
          item_name: string
          line_amount: number | null
          line_no: number
          quantity: number
          source_line_id: string | null
          specification: string | null
          tender_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_name: string
          line_amount?: number | null
          line_no: number
          quantity?: number
          source_line_id?: string | null
          specification?: string | null
          tender_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_name?: string
          line_amount?: number | null
          line_no?: number
          quantity?: number
          source_line_id?: string | null
          specification?: string | null
          tender_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_tender_items_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "procurement_tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_tenders: {
        Row: {
          bid_end_at: string | null
          bid_start_at: string | null
          bid_validity_days: number | null
          bidding_closed_at: string | null
          bidding_closed_by: string | null
          case_id: string
          created_at: string
          created_by: string | null
          currency: string
          delivery_days: number | null
          eligibility: string | null
          emd_amount: number
          emd_exemption_note: string | null
          emd_required: boolean
          estimated_value: number | null
          evaluation_note: string | null
          financial_opening_at: string | null
          floated_at: string | null
          floated_by: string | null
          gst_pct: number
          id: string
          mode: string
          notice_document_id: string | null
          notice_issued_at: string | null
          notice_snapshot: Json | null
          payment_terms: string | null
          performance_security_pct: number
          portal_reference: string | null
          portal_url: string | null
          prebid_meeting_at: string | null
          prebid_venue: string | null
          published_on: string | null
          query_deadline_at: string | null
          reference_no: string | null
          scope_summary: string | null
          single_justification: string | null
          status: string
          technical_opening_at: string | null
          tender_fee: number
          title: string | null
          updated_at: string
          warranty_terms: string | null
        }
        Insert: {
          bid_end_at?: string | null
          bid_start_at?: string | null
          bid_validity_days?: number | null
          bidding_closed_at?: string | null
          bidding_closed_by?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_days?: number | null
          eligibility?: string | null
          emd_amount?: number
          emd_exemption_note?: string | null
          emd_required?: boolean
          estimated_value?: number | null
          evaluation_note?: string | null
          financial_opening_at?: string | null
          floated_at?: string | null
          floated_by?: string | null
          gst_pct?: number
          id?: string
          mode?: string
          notice_document_id?: string | null
          notice_issued_at?: string | null
          notice_snapshot?: Json | null
          payment_terms?: string | null
          performance_security_pct?: number
          portal_reference?: string | null
          portal_url?: string | null
          prebid_meeting_at?: string | null
          prebid_venue?: string | null
          published_on?: string | null
          query_deadline_at?: string | null
          reference_no?: string | null
          scope_summary?: string | null
          single_justification?: string | null
          status?: string
          technical_opening_at?: string | null
          tender_fee?: number
          title?: string | null
          updated_at?: string
          warranty_terms?: string | null
        }
        Update: {
          bid_end_at?: string | null
          bid_start_at?: string | null
          bid_validity_days?: number | null
          bidding_closed_at?: string | null
          bidding_closed_by?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          delivery_days?: number | null
          eligibility?: string | null
          emd_amount?: number
          emd_exemption_note?: string | null
          emd_required?: boolean
          estimated_value?: number | null
          evaluation_note?: string | null
          financial_opening_at?: string | null
          floated_at?: string | null
          floated_by?: string | null
          gst_pct?: number
          id?: string
          mode?: string
          notice_document_id?: string | null
          notice_issued_at?: string | null
          notice_snapshot?: Json | null
          payment_terms?: string | null
          performance_security_pct?: number
          portal_reference?: string | null
          portal_url?: string | null
          prebid_meeting_at?: string | null
          prebid_venue?: string | null
          published_on?: string | null
          query_deadline_at?: string | null
          reference_no?: string | null
          scope_summary?: string | null
          single_justification?: string | null
          status?: string
          technical_opening_at?: string | null
          tender_fee?: number
          title?: string | null
          updated_at?: string
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_tenders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "procurement_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_tenders_notice_document_id_fkey"
            columns: ["notice_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
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
      procurement_vendors: {
        Row: {
          active: boolean
          address: string | null
          blacklist_reason: string | null
          blacklisted: boolean
          blacklisted_at: string | null
          blacklisted_by: string | null
          category_id: string | null
          city: string | null
          contact_person: string | null
          country: string
          created_at: string
          created_by: string | null
          email: string | null
          gst_number: string | null
          id: string
          msme_category: string | null
          name: string
          notes: string | null
          pan_number: string | null
          phone: string | null
          registration_id: string | null
          state: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          blacklist_reason?: string | null
          blacklisted?: boolean
          blacklisted_at?: string | null
          blacklisted_by?: string | null
          category_id?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          msme_category?: string | null
          name: string
          notes?: string | null
          pan_number?: string | null
          phone?: string | null
          registration_id?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          blacklist_reason?: string | null
          blacklisted?: boolean
          blacklisted_at?: string | null
          blacklisted_by?: string | null
          category_id?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          msme_category?: string | null
          name?: string
          notes?: string | null
          pan_number?: string | null
          phone?: string | null
          registration_id?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_vendors_category_id_fkey"
            columns: ["category_id"]
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
      procurement_amend_po: {
        Args: {
          _case_id: string
          _delivery_date?: string
          _delivery_terms?: string
          _reason: string
          _special_conditions?: string
          _total_value?: number
        }
        Returns: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_approve_cst_authority: {
        Args: { _case_id: string; _remarks?: string }
        Returns: {
          actor_id: string | null
          case_id: string
          decided_at: string
          id: string
          kind: string
          remarks: string | null
          revision: number
          signature_id: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_commercial_approvals"
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
          gaps_function: string | null
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
      procurement_available_actions_with_gaps: {
        Args: { _case_id: string }
        Returns: {
          action: Database["public"]["Enums"]["procurement_action"]
          chair_only: boolean
          code: string
          description: string
          entry_status: string
          gaps: string[]
          gaps_function: string
          guard_function: string
          label: string
          permission: string
          requires_remarks: boolean
          requires_signature: boolean
          sort_order: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          target_stage: Database["public"]["Enums"]["procurement_stage"]
        }[]
      }
      procurement_bid_document_readiness: {
        Args: { _case_id: string }
        Returns: {
          bidder_id: string
          failed: number
          indexed: number
          still_reading: number
          total: number
        }[]
      }
      procurement_bid_submissions: {
        Args: { _case_id: string }
        Returns: {
          bid_status: string
          bidder_id: string
          document_count: number
          indexed_count: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      procurement_boq_total: { Args: { _case_id: string }; Returns: number }
      procurement_budget_available: {
        Args: { _budget_head_id: string }
        Returns: number
      }
      procurement_budget_committed: {
        Args: { _budget_head_id: string }
        Returns: number
      }
      procurement_budget_ledger: {
        Args: never
        Returns: {
          active: boolean
          allocated: number
          available: number
          code: string
          committed: number
          department: string
          fiscal_year: string
          id: string
          name: string
        }[]
      }
      procurement_build_notice: { Args: { _tender_id: string }; Returns: Json }
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
      procurement_case_activity: {
        Args: { _case_id: string }
        Returns: {
          actor_id: string
          actor_name: string
          actor_role: string
          detail: string
          happened_at: string
          kind: string
          stage: Database["public"]["Enums"]["procurement_stage"]
          title: string
          to_stage: Database["public"]["Enums"]["procurement_stage"]
        }[]
      }
      procurement_case_document_readiness: {
        Args: { _case_id: string }
        Returns: {
          failed: number
          indexed: number
          still_reading: number
          total: number
        }[]
      }
      procurement_case_signatures_named: {
        Args: { _case_id: string }
        Returns: {
          action_code: string
          id: string
          image: string
          kind: string
          signed_at: string
          signer_id: string
          signer_name: string
          signer_role: string
          stage: Database["public"]["Enums"]["procurement_stage"]
        }[]
      }
      procurement_close_bidding: {
        Args: { _case_id: string; _remarks?: string }
        Returns: {
          bid_end_at: string | null
          bid_start_at: string | null
          bid_validity_days: number | null
          bidding_closed_at: string | null
          bidding_closed_by: string | null
          case_id: string
          created_at: string
          created_by: string | null
          currency: string
          delivery_days: number | null
          eligibility: string | null
          emd_amount: number
          emd_exemption_note: string | null
          emd_required: boolean
          estimated_value: number | null
          evaluation_note: string | null
          financial_opening_at: string | null
          floated_at: string | null
          floated_by: string | null
          gst_pct: number
          id: string
          mode: string
          notice_document_id: string | null
          notice_issued_at: string | null
          notice_snapshot: Json | null
          payment_terms: string | null
          performance_security_pct: number
          portal_reference: string | null
          portal_url: string | null
          prebid_meeting_at: string | null
          prebid_venue: string | null
          published_on: string | null
          query_deadline_at: string | null
          reference_no: string | null
          scope_summary: string | null
          single_justification: string | null
          status: string
          technical_opening_at: string | null
          tender_fee: number
          title: string | null
          updated_at: string
          warranty_terms: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_tenders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_close_negotiation_round: {
        Args: {
          _delivery_days?: number
          _final_offer: number
          _notes?: string
          _override_reason?: string
          _payment_terms?: string
          _round_id: string
          _warranty_months?: number
        }
        Returns: {
          case_id: string
          closed_at: string | null
          committee_counter_offer: number | null
          conducted_by: string | null
          created_at: string
          created_by: string | null
          delivery_days: number | null
          final_offer: number | null
          id: string
          notes: string | null
          override_reason: string | null
          payment_terms: string | null
          round_date: string
          round_no: number
          status: string
          updated_at: string
          vendor_offer: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_negotiation_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_commercial_assert_may_price: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_commercial_assert_open: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_commercial_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_commercial_line_comparison: {
        Args: { _case_id: string }
        Returns: {
          bidder_id: string
          estimated_amount: number
          estimated_rate: number
          is_line_l1: boolean
          item_name: string
          line_amount: number
          line_no: number
          line_rank: number
          quantity: number
          tender_item_id: string
          unit: string
          unit_rate: number
          vendor_name: string
        }[]
      }
      procurement_commercial_ranking: {
        Args: { _case_id: string }
        Returns: {
          base_price: number
          bidder_id: string
          commercial_compliance: string
          delivery_days: number
          delivery_score: number
          discount: number
          eligible: boolean
          evaluated_cost: number
          freight: number
          fully_priced: boolean
          gst_amount: number
          gst_pct: number
          ineligible_reason: string
          is_l1: boolean
          loading_amount: number
          loading_note: string
          other_charges: number
          payment_terms: string
          price_score: number
          price_source: string
          rank: number
          taxable_value: number
          tec_qualified: boolean
          vendor_id: string
          vendor_name: string
          warranty_months: number
          warranty_score: number
          weighted_score: number
        }[]
      }
      procurement_commercial_reasonableness: {
        Args: { _case_id: string }
        Returns: {
          estimate: number
          estimate_gst_pct: number
          estimate_inclusive: number
          estimate_source: string
          l1_bidder_id: string
          l1_cost: number
          l1_vendor_name: string
          status: string
          variance: number
          variance_pct: number
        }[]
      }
      procurement_commercial_record_recommendation: {
        Args: {
          _bidder_id?: string
          _case_id: string
          _justification_reason?: string
          _justification_text?: string
          _outcome: string
          _remarks?: string
        }
        Returns: {
          authority_reasons: string[]
          authority_required: boolean
          case_id: string
          computed_l1_bidder_id: string | null
          justification_reason: string | null
          justification_text: string | null
          outcome: string
          recommended_at: string
          recommended_bidder_id: string | null
          recommended_by: string | null
          remarks: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "procurement_commercial_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_commercial_reopen: {
        Args: { _case_id: string; _reason: string }
        Returns: {
          case_id: string
          created_at: string
          quote_status: string
          ranking_basis: string
          revision: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_commercial"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_commercial_seed: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_committee_kind_for_stage: {
        Args: { _stage: Database["public"]["Enums"]["procurement_stage"] }
        Returns: Database["public"]["Enums"]["procurement_committee_kind"]
      }
      procurement_cst_assert_draft: {
        Args: { _case_id: string }
        Returns: number
      }
      procurement_cst_assert_may_evaluate: {
        Args: { _case_id: string }
        Returns: number
      }
      procurement_cst_build_snapshot: {
        Args: { _case_id: string }
        Returns: Json
      }
      procurement_cst_compile: {
        Args: { _case_id: string }
        Returns: {
          case_id: string
          compiled_at: string | null
          compiled_by: string | null
          computed_l1_bidder_id: string | null
          created_at: string
          generated_on: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          ranking_basis: string | null
          reopen_reason: string | null
          signature_id: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          snapshot: Json | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "procurement_cst_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_cst_gaps: { Args: { _case_id: string }; Returns: string[] }
      procurement_cst_generate_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_cst_lock: {
        Args: { _case_id: string }
        Returns: {
          case_id: string
          compiled_at: string | null
          compiled_by: string | null
          computed_l1_bidder_id: string | null
          created_at: string
          generated_on: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          ranking_basis: string | null
          reopen_reason: string | null
          signature_id: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          snapshot: Json | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "procurement_cst_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_cycle_time: {
        Args: never
        Returns: {
          avg_hours: number
          moves: number
          sla_hours: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          stage_label: string
        }[]
      }
      procurement_department_spend: {
        Args: never
        Returns: {
          cases: number
          department: string
          open_cases: number
          total_value: number
        }[]
      }
      procurement_dpc_constitute_committee: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_float_tender: {
        Args: { _case_id: string; _remarks?: string }
        Returns: {
          bid_end_at: string | null
          bid_start_at: string | null
          bid_validity_days: number | null
          bidding_closed_at: string | null
          bidding_closed_by: string | null
          case_id: string
          created_at: string
          created_by: string | null
          currency: string
          delivery_days: number | null
          eligibility: string | null
          emd_amount: number
          emd_exemption_note: string | null
          emd_required: boolean
          estimated_value: number | null
          evaluation_note: string | null
          financial_opening_at: string | null
          floated_at: string | null
          floated_by: string | null
          gst_pct: number
          id: string
          mode: string
          notice_document_id: string | null
          notice_issued_at: string | null
          notice_snapshot: Json | null
          payment_terms: string | null
          performance_security_pct: number
          portal_reference: string | null
          portal_url: string | null
          prebid_meeting_at: string | null
          prebid_venue: string | null
          published_on: string | null
          query_deadline_at: string | null
          reference_no: string | null
          scope_summary: string | null
          single_justification: string | null
          status: string
          technical_opening_at: string | null
          tender_fee: number
          title: string | null
          updated_at: string
          warranty_terms: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_tenders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_grn_assert_may_record: {
        Args: { _case_id: string }
        Returns: {
          case_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          cycle: number
          id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_goods_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_grn_assert_open: {
        Args: { _case_id: string }
        Returns: {
          case_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          cycle: number
          id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_goods_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_grn_close_cycle_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_grn_forward_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_grn_seed: { Args: { _case_id: string }; Returns: undefined }
      procurement_grn_summary: {
        Args: { _case_id: string }
        Returns: {
          fully_received: boolean
          item_name: string
          line_no: number
          ordered_qty: number
          total_accepted_qty: number
          total_accepted_value: number
          total_delivered_qty: number
          total_rejected_qty: number
          unit: string
          unit_rate: number
        }[]
      }
      procurement_guard_commercial_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_cst_generate_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_cst_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_grn_close_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_grn_forward_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_payment_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_pnc_agreed: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_po_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_proposal_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_requisition_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_tec_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_guard_tender_ready: {
        Args: { _case_id: string; _payload?: Json }
        Returns: boolean
      }
      procurement_headline_metrics: {
        Args: never
        Returns: {
          avg_cycle_days: number
          awarded_value: number
          breaching_cases: number
          closed_cases: number
          open_cases: number
          open_value: number
          rejected_cases: number
        }[]
      }
      procurement_issue_corrigendum: {
        Args: { _case_id: string; _payload: Json }
        Returns: {
          after_snapshot: Json
          before_snapshot: Json
          case_id: string
          category: string
          created_at: string
          detail: string | null
          id: string
          issued_by: string | null
          issued_on: string
          needs_finance_review: boolean
          new_bid_end_at: string | null
          notice_document_id: string | null
          notice_snapshot: Json | null
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          serial_no: number
          status: string
          tender_id: string
          title: string
          updated_at: string
          value_after: number | null
          value_before: number | null
          value_delta: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_corrigenda"
          isOneToOne: true
          isSetofReturn: false
        }
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
      procurement_monthly_flow: {
        Args: { _months?: number }
        Returns: {
          closed: number
          month: string
          opened: number
          opened_value: number
        }[]
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
      procurement_open_negotiation_round: {
        Args: {
          _case_id: string
          _committee_counter_offer?: number
          _delivery_days?: number
          _notes?: string
          _payment_terms?: string
          _vendor_offer: number
          _warranty_months?: number
        }
        Returns: {
          case_id: string
          closed_at: string | null
          committee_counter_offer: number | null
          conducted_by: string | null
          created_at: string
          created_by: string | null
          delivery_days: number | null
          final_offer: number | null
          id: string
          notes: string | null
          override_reason: string | null
          payment_terms: string | null
          round_date: string
          round_no: number
          status: string
          updated_at: string
          vendor_offer: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_negotiation_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_payment_assert_may_record: {
        Args: { _case_id: string }
        Returns: {
          accepted_value: number
          case_id: string
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          invoice_amount: number
          invoice_date: string | null
          invoice_number: string | null
          penalty_deductions: number
          recommended_amount: number | null
          remarks: string | null
          status: string
          updated_at: string
          voucher_date: string | null
          voucher_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_payment_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_payment_assert_open: {
        Args: { _case_id: string }
        Returns: {
          accepted_value: number
          case_id: string
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          invoice_amount: number
          invoice_date: string | null
          invoice_number: string | null
          penalty_deductions: number
          recommended_amount: number | null
          remarks: string | null
          status: string
          updated_at: string
          voucher_date: string | null
          voucher_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_payment_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_payment_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_payment_seed: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_pnc_agreement_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_pnc_assert_may_negotiate: {
        Args: { _case_id: string }
        Returns: {
          bidder_id: string | null
          case_id: string
          concluded_at: string | null
          concluded_by: string | null
          created_at: string
          created_by: string | null
          final_delivery_days: number | null
          final_payment_terms: string | null
          final_price: number | null
          final_warranty_months: number | null
          mandate_instructions: string | null
          mandate_reason: string
          objectives: string[]
          opening_offer: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_negotiations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_pnc_assert_open: {
        Args: { _case_id: string }
        Returns: {
          bidder_id: string | null
          case_id: string
          concluded_at: string | null
          concluded_by: string | null
          created_at: string
          created_by: string | null
          final_delivery_days: number | null
          final_payment_terms: string | null
          final_price: number | null
          final_warranty_months: number | null
          mandate_instructions: string | null
          mandate_reason: string
          objectives: string[]
          opening_offer: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_negotiations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_pnc_constitute_committee: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_pnc_seed: { Args: { _case_id: string }; Returns: undefined }
      procurement_po_assert_may_edit: {
        Args: { _case_id: string }
        Returns: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_po_assert_may_manage: {
        Args: { _case_id: string }
        Returns: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_po_assert_open: {
        Args: { _case_id: string }
        Returns: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_po_gaps: { Args: { _case_id: string }; Returns: string[] }
      procurement_po_seed: { Args: { _case_id: string }; Returns: undefined }
      procurement_proposal_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_proposal_seed: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_publish_boq: { Args: { _case_id: string }; Returns: number }
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
      procurement_record_payment_ai_draft: {
        Args: { _case_id: string; _model: string; _recommendation_note: string }
        Returns: {
          case_id: string
          generated_at: string
          model: string | null
          recommendation_note: string | null
          requested_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_payment_ai_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_record_po_ai_draft: {
        Args: {
          _case_id: string
          _delivery_terms_draft: string
          _model: string
          _payment_terms_draft: string
          _special_conditions_draft: string
          _warranty_clause_draft: string
        }
        Returns: {
          case_id: string
          delivery_terms_draft: string | null
          generated_at: string
          model: string | null
          payment_terms_draft: string | null
          requested_by: string | null
          special_conditions_draft: string | null
          warranty_clause_draft: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_po_ai_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_record_po_vendor_ack: {
        Args: { _case_id: string; _note?: string; _status: string }
        Returns: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_record_quote_schedule: {
        Args: {
          _lines: Json
          _quote_id: string
          _source?: string
          _stated_total?: number
        }
        Returns: Json
      }
      procurement_record_tec_ai_suggestion: {
        Args: {
          _bidder_id: string
          _compliance_status: string
          _evidence: Json
          _model: string
          _qualified: boolean
          _score: number
          _summary: string
        }
        Returns: {
          bidder_id: string
          case_id: string
          compliance_status: string
          created_at: string
          evidence: Json
          generated_at: string
          model: string | null
          qualified: boolean | null
          requested_by: string | null
          score: number | null
          summary: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_tec_ai_suggestions"
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
      procurement_requisition_gaps: {
        Args: { _case_id: string }
        Returns: string[]
      }
      procurement_revoke_corrigendum: {
        Args: { _corrigendum_id: string; _reason: string }
        Returns: {
          after_snapshot: Json
          before_snapshot: Json
          case_id: string
          category: string
          created_at: string
          detail: string | null
          id: string
          issued_by: string | null
          issued_on: string
          needs_finance_review: boolean
          new_bid_end_at: string | null
          notice_document_id: string | null
          notice_snapshot: Json | null
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          serial_no: number
          status: string
          tender_id: string
          title: string
          updated_at: string
          value_after: number | null
          value_before: number | null
          value_delta: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_corrigenda"
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
      procurement_save_cst_scrutiny: {
        Args: {
          _case_id: string
          _item_key: string
          _remarks?: string
          _status: string
        }
        Returns: {
          case_id: string
          item_key: string
          remarks: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "procurement_cst_scrutiny"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_save_grn_line: {
        Args: {
          _accepted_qty: number
          _delivered_qty: number
          _discrepancy_reason?: string
          _line_id: string
          _rejected_qty: number
        }
        Returns: {
          accepted_qty: number
          accepted_value: number | null
          case_id: string
          created_at: string
          delivered_qty: number
          discrepancy_reason: string | null
          grn_id: string
          id: string
          item_name: string
          line_no: number
          ordered_qty: number
          previously_accepted_qty: number
          rejected_qty: number
          unit: string | null
          unit_rate: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_grn_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_save_negotiation_mandate: {
        Args: {
          _case_id: string
          _instructions?: string
          _objectives?: string[]
          _reason: string
        }
        Returns: {
          bidder_id: string | null
          case_id: string
          concluded_at: string | null
          concluded_by: string | null
          created_at: string
          created_by: string | null
          final_delivery_days: number | null
          final_payment_terms: string | null
          final_price: number | null
          final_warranty_months: number | null
          mandate_instructions: string | null
          mandate_reason: string
          objectives: string[]
          opening_offer: number | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_negotiations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_save_payment_recommendation: {
        Args: {
          _case_id: string
          _invoice_amount: number
          _invoice_date: string
          _invoice_number: string
          _penalty_deductions: number
          _remarks: string
          _voucher_date: string
          _voucher_number: string
        }
        Returns: {
          accepted_value: number
          case_id: string
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          invoice_amount: number
          invoice_date: string | null
          invoice_number: string | null
          penalty_deductions: number
          recommended_amount: number | null
          remarks: string | null
          status: string
          updated_at: string
          voucher_date: string | null
          voucher_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_payment_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_save_po: {
        Args: {
          _billing_address: string
          _case_id: string
          _delivery_address: string
          _delivery_date: string
          _delivery_terms: string
          _payment_terms: string
          _penalty_clause: string
          _special_conditions: string
          _warranty_months: number
        }
        Returns: {
          billing_address: string | null
          case_id: string
          created_at: string
          created_by: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_terms: string | null
          issued_at: string | null
          issued_by: string | null
          payment_terms: string | null
          penalty_clause: string | null
          po_no: string
          recommended_bidder_id: string | null
          special_conditions: string | null
          status: string
          total_value: number | null
          updated_at: string
          vendor_ack_note: string | null
          vendor_ack_recorded_at: string | null
          vendor_ack_recorded_by: string | null
          vendor_ack_status: string
          version: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_save_proposal: {
        Args: { _case_id: string; _recommendation_note: string }
        Returns: {
          case_id: string
          created_at: string
          created_by: string | null
          delivery_days: number | null
          negotiated_price: number | null
          original_evaluated_cost: number | null
          payment_terms: string | null
          recommendation_note: string
          recommended_bidder_id: string | null
          updated_at: string
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_purchase_proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_save_quote: {
        Args: {
          _base_price?: number
          _bidder_id: string
          _commercial_compliance?: string
          _discount?: number
          _freight?: number
          _gst_pct?: number
          _loading_amount?: number
          _loading_note?: string
          _other_charges?: number
          _price_source?: string
          _remarks?: string
        }
        Returns: {
          base_price: number
          bidder_id: string
          case_id: string
          commercial_compliance: string
          created_at: string
          created_by: string | null
          discount: number
          evaluated_cost: number | null
          freight: number
          fully_priced: boolean
          gst_amount: number | null
          gst_pct: number
          id: string
          loading_amount: number
          loading_note: string | null
          other_charges: number
          price_source: string
          remarks: string | null
          schedule_captured_at: string | null
          schedule_issues: Json
          schedule_source: string | null
          stated_total: number | null
          taxable_value: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_commercial_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_search_case_chunks: {
        Args: {
          _bidder_id?: string
          _case_id: string
          _user_id: string
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
      procurement_set_bidder_qualification: {
        Args: { _bidder_id: string; _note?: string; _qualified: boolean }
        Returns: {
          amc_years: number | null
          bid_amount: number | null
          bid_amount_gross: number | null
          bid_reference: string | null
          bid_validity_days: number | null
          case_id: string
          created_at: string
          created_by: string | null
          currency: string
          delivery_days: number | null
          disqualified_reason: string | null
          emd_amount: number
          emd_instrument: string | null
          emd_received_at: string | null
          emd_settled_at: string | null
          emd_settlement_note: string | null
          emd_status: string
          gst_pct: number | null
          id: string
          msme_category: string | null
          payment_terms: string | null
          recorded_by: string | null
          remarks: string | null
          status: string
          submitted_at: string | null
          tec_decided_at: string | null
          tec_decided_by: string | null
          tec_note: string | null
          tec_qualified: boolean | null
          tender_id: string
          updated_at: string
          vendor_id: string
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_bidders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_set_ranking_basis: {
        Args: { _basis: string; _case_id: string }
        Returns: {
          case_id: string
          created_at: string
          quote_status: string
          ranking_basis: string
          revision: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_commercial"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_stage_aging: {
        Args: never
        Returns: {
          breached: boolean
          case_id: string
          case_no: string
          entered_at: string
          estimated_cost: number
          hours_in_stage: number
          sla_hours: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          stage_label: string
          title: string
        }[]
      }
      procurement_stage_counts: {
        Args: never
        Returns: {
          open_cases: number
          stage: Database["public"]["Enums"]["procurement_stage"]
          total_value: number
        }[]
      }
      procurement_submit_tec_evaluation: {
        Args: {
          _bidder_id: string
          _compliance_status: string
          _qualified: boolean
          _remarks: string
          _score: number
          _signature?: Json
        }
        Returns: {
          bidder_id: string
          case_id: string
          compliance_status: string
          created_at: string
          id: string
          member_id: string
          qualified: boolean | null
          remarks: string | null
          score: number | null
          signature_id: string | null
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "procurement_tec_evaluations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_sync_case_cost: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_sync_quote_price: {
        Args: { _quote_id: string }
        Returns: undefined
      }
      procurement_tec_assert_open: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_tec_case_consensus: {
        Args: { _case_id: string }
        Returns: {
          avg_score: number
          bidder_id: string
          member_count: number
          qualified_count: number
          qualified_pct: number
        }[]
      }
      procurement_tec_constitute_committee: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_tec_gaps: { Args: { _case_id: string }; Returns: string[] }
      procurement_tec_seed_checklist: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_tender_assert_desk: {
        Args: { _case_id: string }
        Returns: undefined
      }
      procurement_tender_boq_total: {
        Args: { _tender_id: string }
        Returns: number
      }
      procurement_tender_gaps: { Args: { _case_id: string }; Returns: string[] }
      procurement_tender_summary: {
        Args: { _case_id: string }
        Returns: {
          bid_end_at: string
          bid_start_at: string
          bidder_count: number
          corrigendum_count: number
          emd_outstanding_count: number
          floated_at: string
          invitee_count: number
          item_count: number
          lowest_bid: number
          mode: string
          notice_document_id: string
          notice_issued_at: string
          portal_reference: string
          published_value: number
          reference_no: string
          status: string
          tender_id: string
        }[]
      }
      procurement_transition_allowed: {
        Args: {
          _from: Database["public"]["Enums"]["procurement_stage"]
          _to: Database["public"]["Enums"]["procurement_stage"]
        }
        Returns: boolean
      }
      procurement_update_negotiation_round: {
        Args: {
          _committee_counter_offer?: number
          _delivery_days?: number
          _notes?: string
          _payment_terms?: string
          _round_id: string
          _vendor_offer: number
          _warranty_months?: number
        }
        Returns: {
          case_id: string
          closed_at: string | null
          committee_counter_offer: number | null
          conducted_by: string | null
          created_at: string
          created_by: string | null
          delivery_days: number | null
          final_offer: number | null
          id: string
          notes: string | null
          override_reason: string | null
          payment_terms: string | null
          round_date: string
          round_no: number
          status: string
          updated_at: string
          vendor_offer: number
          warranty_months: number | null
        }
        SetofOptions: {
          from: "*"
          to: "procurement_negotiation_rounds"
          isOneToOne: true
          isSetofReturn: false
        }
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
