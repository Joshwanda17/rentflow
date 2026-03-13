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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_advance_ledger: {
        Row: {
          advance_id: string
          amount_deducted: number
          closing_balance: number
          created_at: string
          date: string
          deduction_status: string
          id: string
          interest_accrued: number
          opening_balance: number
        }
        Insert: {
          advance_id: string
          amount_deducted?: number
          closing_balance?: number
          created_at?: string
          date: string
          deduction_status?: string
          id?: string
          interest_accrued?: number
          opening_balance?: number
        }
        Update: {
          advance_id?: string
          amount_deducted?: number
          closing_balance?: number
          created_at?: string
          date?: string
          deduction_status?: string
          id?: string
          interest_accrued?: number
          opening_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_advance_ledger_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "agent_advances"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_advance_topups: {
        Row: {
          advance_id: string
          amount: number
          created_at: string
          id: string
          topped_up_by: string
        }
        Insert: {
          advance_id: string
          amount: number
          created_at?: string
          id?: string
          topped_up_by: string
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          id?: string
          topped_up_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_advance_topups_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "agent_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_advance_topups_topped_up_by_fkey"
            columns: ["topped_up_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advance_topups_topped_up_by_fkey"
            columns: ["topped_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_advance_topups_topped_up_by_fkey"
            columns: ["topped_up_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advance_topups_topped_up_by_fkey"
            columns: ["topped_up_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_advances: {
        Row: {
          agent_id: string
          created_at: string
          cycle_days: number
          daily_rate: number
          expires_at: string
          id: string
          issued_at: string
          issued_by: string
          outstanding_balance: number
          principal: number
          registration_fee: number | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          cycle_days?: number
          daily_rate?: number
          expires_at?: string
          id?: string
          issued_at?: string
          issued_by: string
          outstanding_balance?: number
          principal?: number
          registration_fee?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          cycle_days?: number
          daily_rate?: number
          expires_at?: string
          id?: string
          issued_at?: string
          issued_by?: string
          outstanding_balance?: number
          principal?: number
          registration_fee?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_advances_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advances_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_advances_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advances_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advances_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advances_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_advances_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_advances_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_collections: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          float_after: number
          float_before: number
          id: string
          location_name: string | null
          momo_payer_name: string | null
          momo_phone: string | null
          momo_provider: string | null
          momo_transaction_id: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["collection_payment_method"]
          sms_sent_agent: boolean | null
          sms_sent_tenant: boolean | null
          tenant_id: string
          token_id: string | null
          tracking_id: string | null
          visit_id: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          float_after?: number
          float_before?: number
          id?: string
          location_name?: string | null
          momo_payer_name?: string | null
          momo_phone?: string | null
          momo_provider?: string | null
          momo_transaction_id?: string | null
          notes?: string | null
          payment_method: Database["public"]["Enums"]["collection_payment_method"]
          sms_sent_agent?: boolean | null
          sms_sent_tenant?: boolean | null
          tenant_id: string
          token_id?: string | null
          tracking_id?: string | null
          visit_id?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          float_after?: number
          float_before?: number
          id?: string
          location_name?: string | null
          momo_payer_name?: string | null
          momo_phone?: string | null
          momo_provider?: string | null
          momo_transaction_id?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["collection_payment_method"]
          sms_sent_agent?: boolean | null
          sms_sent_tenant?: boolean | null
          tenant_id?: string
          token_id?: string | null
          tracking_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_collections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collections_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "payment_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collections_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "agent_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_commission_payouts: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          id: string
          mobile_money_number: string
          mobile_money_provider: string
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_at: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          id?: string
          mobile_money_number: string
          mobile_money_provider: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          id?: string
          mobile_money_number?: string
          mobile_money_provider?: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_earnings: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          description: string | null
          earning_type: string
          id: string
          rent_request_id: string | null
          source_user_id: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          description?: string | null
          earning_type: string
          id?: string
          rent_request_id?: string | null
          source_user_id?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          description?: string | null
          earning_type?: string
          id?: string
          rent_request_id?: string | null
          source_user_id?: string | null
        }
        Relationships: []
      }
      agent_float_limits: {
        Row: {
          agent_id: string
          assigned_by: string | null
          cash_on_hand: number | null
          collected_today: number
          created_at: string
          critical_threshold_pct: number | null
          daily_txn_limit: number | null
          float_limit: number
          id: string
          is_paused: boolean | null
          last_reset_date: string
          low_threshold_pct: number | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          assigned_by?: string | null
          cash_on_hand?: number | null
          collected_today?: number
          created_at?: string
          critical_threshold_pct?: number | null
          daily_txn_limit?: number | null
          float_limit?: number
          id?: string
          is_paused?: boolean | null
          last_reset_date?: string
          low_threshold_pct?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assigned_by?: string | null
          cash_on_hand?: number | null
          collected_today?: number
          created_at?: string
          critical_threshold_pct?: number | null
          daily_txn_limit?: number | null
          float_limit?: number
          id?: string
          is_paused?: boolean | null
          last_reset_date?: string
          low_threshold_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_float_limits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_limits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_limits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_limits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_limits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_limits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_limits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_limits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_goals: {
        Row: {
          agent_id: string
          created_at: string
          goal_month: string
          id: string
          notes: string | null
          target_activations: number | null
          target_registrations: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          goal_month: string
          id?: string
          notes?: string | null
          target_activations?: number | null
          target_registrations?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          goal_month?: string
          id?: string
          notes?: string | null
          target_activations?: number | null
          target_registrations?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_rebalance_records: {
        Row: {
          agent_id: string
          amount: number
          approved_by: string | null
          created_at: string
          direction: string
          id: string
          method: string | null
          reference_id: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          approved_by?: string | null
          created_at?: string
          direction: string
          id?: string
          method?: string | null
          reference_id?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          approved_by?: string | null
          created_at?: string
          direction?: string
          id?: string
          method?: string | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_rebalance_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_rebalance_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_receipts: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          id: string
          notes: string | null
          payer_name: string
          payer_phone: string
          payment_method: string
          receipt_image_url: string | null
          transaction_id: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payer_name: string
          payer_phone: string
          payment_method?: string
          receipt_image_url?: string | null
          transaction_id?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payer_name?: string
          payer_phone?: string
          payment_method?: string
          receipt_image_url?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_receipts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_receipts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_receipts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_receipts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_subagents: {
        Row: {
          created_at: string
          id: string
          parent_agent_id: string
          source: string
          sub_agent_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_agent_id: string
          source?: string
          sub_agent_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_agent_id?: string
          source?: string
          sub_agent_id?: string
        }
        Relationships: []
      }
      agent_visits: {
        Row: {
          accuracy: number | null
          agent_id: string
          checked_in_at: string
          created_at: string
          id: string
          latitude: number
          location_name: string | null
          longitude: number
          tenant_id: string
        }
        Insert: {
          accuracy?: number | null
          agent_id: string
          checked_in_at?: string
          created_at?: string
          id?: string
          latitude: number
          location_name?: string | null
          longitude: number
          tenant_id: string
        }
        Update: {
          accuracy?: number | null
          agent_id?: string
          checked_in_at?: string
          created_at?: string
          id?: string
          latitude?: number
          location_name?: string | null
          longitude?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
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
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_access_limits: {
        Row: {
          base_limit: number
          bonus_from_landlord_rent: number
          bonus_from_ratings: number
          bonus_from_receipts: number
          bonus_from_rent_history: number
          created_at: string
          id: string
          total_limit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_limit?: number
          bonus_from_landlord_rent?: number
          bonus_from_ratings?: number
          bonus_from_receipts?: number
          bonus_from_rent_history?: number
          created_at?: string
          id?: string
          total_limit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_limit?: number
          bonus_from_landlord_rent?: number
          bonus_from_ratings?: number
          bonus_from_receipts?: number
          bonus_from_rent_history?: number
          created_at?: string
          id?: string
          total_limit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_request_details: {
        Row: {
          agent_id: string | null
          agent_verified: boolean | null
          agent_verified_at: string | null
          borrower_id: string
          borrower_mm_name: string
          borrower_phone: string
          created_at: string
          duration_days: number
          electricity_meter_number: string | null
          funder_interest_rate: number
          id: string
          landlord_id: string | null
          landlord_name: string
          landlord_on_platform: boolean | null
          landlord_phone: string
          loan_id: string | null
          location_address: string | null
          location_latitude: number | null
          location_longitude: number | null
          platform_fee_amount: number
          platform_fee_rate: number
          repayment_frequency: string
          total_with_fees: number
          updated_at: string
          water_meter_number: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          borrower_id: string
          borrower_mm_name: string
          borrower_phone: string
          created_at?: string
          duration_days?: number
          electricity_meter_number?: string | null
          funder_interest_rate?: number
          id?: string
          landlord_id?: string | null
          landlord_name: string
          landlord_on_platform?: boolean | null
          landlord_phone: string
          loan_id?: string | null
          location_address?: string | null
          location_latitude?: number | null
          location_longitude?: number | null
          platform_fee_amount?: number
          platform_fee_rate?: number
          repayment_frequency?: string
          total_with_fees?: number
          updated_at?: string
          water_meter_number?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          borrower_id?: string
          borrower_mm_name?: string
          borrower_phone?: string
          created_at?: string
          duration_days?: number
          electricity_meter_number?: string | null
          funder_interest_rate?: number
          id?: string
          landlord_id?: string | null
          landlord_name?: string
          landlord_on_platform?: boolean | null
          landlord_phone?: string
          loan_id?: string | null
          location_address?: string | null
          location_latitude?: number | null
          location_longitude?: number | null
          platform_fee_amount?: number
          platform_fee_rate?: number
          repayment_frequency?: string
          total_with_fees?: number
          updated_at?: string
          water_meter_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_request_details_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "user_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_requests: {
        Row: {
          agent_id: string | null
          amount: number
          approved_at: string | null
          created_at: string
          id: string
          notes: string | null
          processed_by: string | null
          provider: string | null
          rejected_at: string | null
          rejection_reason: string | null
          status: string
          transaction_date: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          amount: number
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          processed_by?: string | null
          provider?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_date?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          amount?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          processed_by?: string | null
          provider?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_date?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      earning_baselines: {
        Row: {
          avg_daily_earnings: number | null
          avg_receipts_per_day: number | null
          avg_referrals_per_week: number | null
          avg_weekly_earnings: number | null
          last_calculated_at: string | null
          receipt_count_7d: number | null
          referral_count_7d: number | null
          total_agent_earnings: number | null
          user_id: string
        }
        Insert: {
          avg_daily_earnings?: number | null
          avg_receipts_per_day?: number | null
          avg_referrals_per_week?: number | null
          avg_weekly_earnings?: number | null
          last_calculated_at?: string | null
          receipt_count_7d?: number | null
          referral_count_7d?: number | null
          total_agent_earnings?: number | null
          user_id: string
        }
        Update: {
          avg_daily_earnings?: number | null
          avg_receipts_per_day?: number | null
          avg_referrals_per_week?: number | null
          avg_weekly_earnings?: number | null
          last_calculated_at?: string | null
          receipt_count_7d?: number | null
          referral_count_7d?: number | null
          total_agent_earnings?: number | null
          user_id?: string
        }
        Relationships: []
      }
      earning_predictions: {
        Row: {
          assumptions: Json | null
          confidence: number
          created_at: string
          id: string
          period: string
          predicted_earnings: number
          user_id: string
        }
        Insert: {
          assumptions?: Json | null
          confidence?: number
          created_at?: string
          id?: string
          period: string
          predicted_earnings?: number
          user_id: string
        }
        Update: {
          assumptions?: Json | null
          confidence?: number
          created_at?: string
          id?: string
          period?: string
          predicted_earnings?: number
          user_id?: string
        }
        Relationships: []
      }
      float_requests: {
        Row: {
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_amount: number
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "float_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "float_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "float_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "float_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "float_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "float_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "float_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      general_ledger: {
        Row: {
          account: string | null
          amount: number
          category: string
          created_at: string
          description: string | null
          direction: string
          id: string
          ledger_scope: string
          linked_party: string | null
          reference_id: string | null
          running_balance: number | null
          source_id: string | null
          source_table: string
          transaction_date: string
          transaction_group_id: string | null
          user_id: string | null
        }
        Insert: {
          account?: string | null
          amount: number
          category: string
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          ledger_scope?: string
          linked_party?: string | null
          reference_id?: string | null
          running_balance?: number | null
          source_id?: string | null
          source_table: string
          transaction_date?: string
          transaction_group_id?: string | null
          user_id?: string | null
        }
        Update: {
          account?: string | null
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          ledger_scope?: string
          linked_party?: string | null
          reference_id?: string | null
          running_balance?: number | null
          source_id?: string | null
          source_table?: string
          transaction_date?: string
          transaction_group_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      investment_withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          earliest_process_date: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          rewards_paused: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          earliest_process_date?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          rewards_paused?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          earliest_process_date?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          rewards_paused?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investor_portfolios: {
        Row: {
          account_name: string | null
          account_number: string | null
          activation_token: string
          agent_id: string
          bank_name: string | null
          created_at: string
          duration_months: number
          id: string
          investment_amount: number
          investor_id: string | null
          invite_id: string | null
          maturity_date: string | null
          mobile_money_number: string | null
          mobile_network: string | null
          next_roi_date: string | null
          payment_method: string | null
          payout_day: number | null
          portfolio_code: string
          portfolio_pin: string
          roi_mode: string
          roi_percentage: number
          status: string
          total_roi_earned: number
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          activation_token?: string
          agent_id: string
          bank_name?: string | null
          created_at?: string
          duration_months: number
          id?: string
          investment_amount: number
          investor_id?: string | null
          invite_id?: string | null
          maturity_date?: string | null
          mobile_money_number?: string | null
          mobile_network?: string | null
          next_roi_date?: string | null
          payment_method?: string | null
          payout_day?: number | null
          portfolio_code: string
          portfolio_pin: string
          roi_mode?: string
          roi_percentage?: number
          status?: string
          total_roi_earned?: number
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          activation_token?: string
          agent_id?: string
          bank_name?: string | null
          created_at?: string
          duration_months?: number
          id?: string
          investment_amount?: number
          investor_id?: string | null
          invite_id?: string | null
          maturity_date?: string | null
          mobile_money_number?: string | null
          mobile_network?: string | null
          next_roi_date?: string | null
          payment_method?: string | null
          payout_day?: number | null
          portfolio_code?: string
          portfolio_pin?: string
          roi_mode?: string
          roi_percentage?: number
          status?: string
          total_roi_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_portfolios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investor_portfolios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_portfolios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investor_portfolios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investor_portfolios_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investor_portfolios_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_portfolios_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investor_portfolios_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investor_portfolios_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "supporter_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_ambassador_referrals: {
        Row: {
          commission_earned: number
          created_at: string
          id: string
          referred_landlord_id: string
          referred_landlord_name: string
          referred_landlord_phone: string
          referrer_landlord_id: string
          rent_processed: number
          status: string
          updated_at: string
        }
        Insert: {
          commission_earned?: number
          created_at?: string
          id?: string
          referred_landlord_id: string
          referred_landlord_name: string
          referred_landlord_phone: string
          referrer_landlord_id: string
          rent_processed?: number
          status?: string
          updated_at?: string
        }
        Update: {
          commission_earned?: number
          created_at?: string
          id?: string
          referred_landlord_id?: string
          referred_landlord_name?: string
          referred_landlord_phone?: string
          referrer_landlord_id?: string
          rent_processed?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      landlords: {
        Row: {
          account_number: string | null
          bank_name: string | null
          caretaker_name: string | null
          caretaker_phone: string | null
          cell: string | null
          country: string | null
          county: string | null
          created_at: string
          description: string | null
          desired_rent_from_welile: number | null
          district: string | null
          electricity_meter_number: string | null
          has_smartphone: boolean | null
          house_category: string | null
          house_number: string | null
          id: string
          is_agent_managed: boolean | null
          latitude: number | null
          location_captured_at: string | null
          location_captured_by: string | null
          longitude: number | null
          managed_by_agent_id: string | null
          management_fee_rate: number | null
          mobile_money_name: string | null
          mobile_money_number: string | null
          monthly_rent: number | null
          name: string
          number_of_houses: number | null
          number_of_rooms: number | null
          phone: string
          property_address: string
          ready_to_receive: boolean | null
          region: string | null
          registered_by: string | null
          rent_balance_due: number
          rent_last_paid_amount: number | null
          rent_last_paid_at: string | null
          sub_county: string | null
          tenant_id: string | null
          tin: string | null
          town_council: string | null
          verification_pin_1: string | null
          verification_pin_2: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
          village: string | null
          water_meter_number: string | null
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          cell?: string | null
          country?: string | null
          county?: string | null
          created_at?: string
          description?: string | null
          desired_rent_from_welile?: number | null
          district?: string | null
          electricity_meter_number?: string | null
          has_smartphone?: boolean | null
          house_category?: string | null
          house_number?: string | null
          id?: string
          is_agent_managed?: boolean | null
          latitude?: number | null
          location_captured_at?: string | null
          location_captured_by?: string | null
          longitude?: number | null
          managed_by_agent_id?: string | null
          management_fee_rate?: number | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          monthly_rent?: number | null
          name: string
          number_of_houses?: number | null
          number_of_rooms?: number | null
          phone: string
          property_address: string
          ready_to_receive?: boolean | null
          region?: string | null
          registered_by?: string | null
          rent_balance_due?: number
          rent_last_paid_amount?: number | null
          rent_last_paid_at?: string | null
          sub_county?: string | null
          tenant_id?: string | null
          tin?: string | null
          town_council?: string | null
          verification_pin_1?: string | null
          verification_pin_2?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          village?: string | null
          water_meter_number?: string | null
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          cell?: string | null
          country?: string | null
          county?: string | null
          created_at?: string
          description?: string | null
          desired_rent_from_welile?: number | null
          district?: string | null
          electricity_meter_number?: string | null
          has_smartphone?: boolean | null
          house_category?: string | null
          house_number?: string | null
          id?: string
          is_agent_managed?: boolean | null
          latitude?: number | null
          location_captured_at?: string | null
          location_captured_by?: string | null
          longitude?: number | null
          managed_by_agent_id?: string | null
          management_fee_rate?: number | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          monthly_rent?: number | null
          name?: string
          number_of_houses?: number | null
          number_of_rooms?: number | null
          phone?: string
          property_address?: string
          ready_to_receive?: boolean | null
          region?: string | null
          registered_by?: string | null
          rent_balance_due?: number
          rent_last_paid_amount?: number | null
          rent_last_paid_at?: string | null
          sub_county?: string | null
          tenant_id?: string | null
          tin?: string | null
          town_council?: string | null
          verification_pin_1?: string | null
          verification_pin_2?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          village?: string | null
          water_meter_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landlords_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "landlords_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlords_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "landlords_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lc1_chairpersons: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          village: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          village: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          village?: string
        }
        Relationships: []
      }
      ledger_account_groups: {
        Row: {
          description: string
          group_code: string
          group_id: string
        }
        Insert: {
          description: string
          group_code: string
          group_id?: string
        }
        Update: {
          description?: string
          group_code?: string
          group_id?: string
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          account_code: string
          account_id: string
          allow_negative: boolean | null
          created_at: string | null
          currency: string | null
          group_id: string
          owner_id: string | null
          owner_type: string | null
        }
        Insert: {
          account_code: string
          account_id?: string
          allow_negative?: boolean | null
          created_at?: string | null
          currency?: string | null
          group_id: string
          owner_id?: string | null
          owner_type?: string | null
        }
        Update: {
          account_code?: string
          account_id?: string
          allow_negative?: boolean | null
          created_at?: string | null
          currency?: string | null
          group_id?: string
          owner_id?: string | null
          owner_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ledger_account_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string | null
          direction: string
          entry_id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency?: string | null
          direction: string
          entry_id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string | null
          direction?: string
          entry_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          approved_by: string | null
          category: string
          created_at: string
          description: string | null
          initiated_by: string | null
          source_id: string | null
          source_table: string | null
          transaction_group_id: string | null
          transaction_id: string
        }
        Insert: {
          approved_by?: string | null
          category: string
          created_at?: string
          description?: string | null
          initiated_by?: string | null
          source_id?: string | null
          source_table?: string | null
          transaction_group_id?: string | null
          transaction_id?: string
        }
        Update: {
          approved_by?: string | null
          category?: string
          created_at?: string
          description?: string | null
          initiated_by?: string | null
          source_id?: string | null
          source_table?: string | null
          transaction_group_id?: string | null
          transaction_id?: string
        }
        Relationships: []
      }
      liquidity_alerts: {
        Row: {
          agent_id: string
          alert_type: string
          created_at: string
          id: string
          message: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          agent_id: string
          alert_type: string
          created_at?: string
          id?: string
          message: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          agent_id?: string
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidity_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "liquidity_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidity_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "liquidity_alerts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "liquidity_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "liquidity_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidity_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "liquidity_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          amount: number
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      location_requests: {
        Row: {
          accuracy: number | null
          captured_at: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          rent_request_id: string
          requested_by: string
          status: string
          target_role: string
          target_user_id: string
          token: string
        }
        Insert: {
          accuracy?: number | null
          captured_at?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          rent_request_id: string
          requested_by: string
          status?: string
          target_role: string
          target_user_id: string
          token?: string
        }
        Update: {
          accuracy?: number | null
          captured_at?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          rent_request_id?: string
          requested_by?: string
          status?: string
          target_role?: string
          target_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_requests_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      money_requests: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          title: string
          type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      onboarding_targets: {
        Row: {
          achieved_count: number
          agent_id: string
          created_at: string
          id: string
          target_count: number
          target_month: string
          updated_at: string
        }
        Insert: {
          achieved_count?: number
          agent_id: string
          created_at?: string
          id?: string
          target_count?: number
          target_month: string
          updated_at?: string
        }
        Update: {
          achieved_count?: number
          agent_id?: string
          created_at?: string
          id?: string
          target_count?: number
          target_month?: string
          updated_at?: string
        }
        Relationships: []
      }
      operations_departments: {
        Row: {
          assigned_by: string | null
          created_at: string
          department: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          department: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          department?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunity_summaries: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          posted_by: string
          total_agents: number
          total_landlords: number
          total_rent_requested: number
          total_requests: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          posted_by: string
          total_agents?: number
          total_landlords?: number
          total_rent_requested?: number
          total_requests?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          posted_by?: string
          total_agents?: number
          total_landlords?: number
          total_rent_requested?: number
          total_requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      otp_verifications: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_tokens: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          expires_at: string
          id: string
          tenant_id: string
          token_code: string
          used: boolean
          used_at: string | null
          visit_id: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          expires_at: string
          id?: string
          tenant_id: string
          token_code: string
          used?: boolean
          used_at?: string | null
          visit_id?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          tenant_id?: string
          token_code?: string
          used?: boolean
          used_at?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_tokens_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "agent_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_wallet_operations: {
        Row: {
          account: string | null
          amount: number
          category: string
          created_at: string
          description: string | null
          direction: string
          id: string
          linked_party: string | null
          metadata: Json | null
          reference_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_table: string
          status: string
          transaction_group_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account?: string | null
          amount: number
          category: string
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          linked_party?: string | null
          metadata?: Json | null
          reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_table: string
          status?: string
          transaction_group_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account?: string | null
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          linked_party?: string | null
          metadata?: Json | null
          reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_table?: string
          status?: string
          transaction_group_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          agent_id: string
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          agent_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          agent_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_orders: {
        Row: {
          agent_commission: number
          agent_id: string
          buyer_id: string
          created_at: string
          delivery_notes: string | null
          estimated_delivery_date: string | null
          id: string
          product_id: string
          quantity: number
          status: string
          status_updated_at: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          agent_commission: number
          agent_id: string
          buyer_id: string
          created_at?: string
          delivery_notes?: string | null
          estimated_delivery_date?: string | null
          id?: string
          product_id: string
          quantity?: number
          status?: string
          status_updated_at?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          agent_commission?: number
          agent_id?: string
          buyer_id?: string
          created_at?: string
          delivery_notes?: string | null
          estimated_delivery_date?: string | null
          id?: string
          product_id?: string
          quantity?: number
          status?: string
          status_updated_at?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          order_id: string | null
          product_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          product_id: string
          rating: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "product_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          agent_id: string
          category: string
          created_at: string
          description: string | null
          discount_ends_at: string | null
          discount_percentage: number | null
          id: string
          image_url: string | null
          name: string
          price: number
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_id: string
          category?: string
          created_at?: string
          description?: string | null
          discount_ends_at?: string | null
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_id?: string
          category?: string
          created_at?: string
          description?: string | null
          discount_ends_at?: string | null
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agent_type: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          email: string
          frozen_at: string | null
          frozen_reason: string | null
          full_name: string
          id: string
          is_frozen: boolean
          last_active_at: string | null
          mobile_money_number: string | null
          mobile_money_provider: string | null
          monthly_rent: number | null
          national_id: string | null
          phone: string
          referrer_id: string | null
          rent_discount_active: boolean
          territory: string | null
          updated_at: string
          verified: boolean
          whatsapp_verified: boolean | null
          whatsapp_verified_at: string | null
        }
        Insert: {
          agent_type?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email: string
          frozen_at?: string | null
          frozen_reason?: string | null
          full_name: string
          id: string
          is_frozen?: boolean
          last_active_at?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          national_id?: string | null
          phone: string
          referrer_id?: string | null
          rent_discount_active?: boolean
          territory?: string | null
          updated_at?: string
          verified?: boolean
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Update: {
          agent_type?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email?: string
          frozen_at?: string | null
          frozen_reason?: string | null
          full_name?: string
          id?: string
          is_frozen?: boolean
          last_active_at?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          national_id?: string | null
          phone?: string
          referrer_id?: string | null
          rent_discount_active?: boolean
          territory?: string | null
          updated_at?: string
          verified?: boolean
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_numbers: {
        Row: {
          created_at: string
          created_by: string
          id: string
          receipt_code: string
          status: string
          vendor_amount: number | null
          vendor_id: string
          vendor_marked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          receipt_code: string
          status?: string
          vendor_amount?: number | null
          vendor_id: string
          vendor_marked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          receipt_code?: string
          status?: string
          vendor_amount?: number | null
          vendor_id?: string
          vendor_marked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_numbers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_rewards: {
        Row: {
          created_at: string
          credited: boolean
          credited_at: string | null
          id: string
          rank: number
          referral_count: number
          reward_amount: number
          reward_month: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credited?: boolean
          credited_at?: string | null
          id?: string
          rank: number
          referral_count: number
          reward_amount: number
          reward_month: string
          user_id: string
        }
        Update: {
          created_at?: string
          credited?: boolean
          credited_at?: string | null
          id?: string
          rank?: number
          referral_count?: number
          reward_amount?: number
          reward_month?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          bonus_amount: number
          created_at: string
          credited: boolean
          credited_at: string | null
          first_transaction_bonus_amount: number | null
          first_transaction_bonus_credited: boolean | null
          first_transaction_bonus_credited_at: string | null
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          credited?: boolean
          credited_at?: string | null
          first_transaction_bonus_amount?: number | null
          first_transaction_bonus_credited?: boolean | null
          first_transaction_bonus_credited_at?: string | null
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          credited?: boolean
          credited_at?: string | null
          first_transaction_bonus_amount?: number | null
          first_transaction_bonus_credited?: boolean | null
          first_transaction_bonus_credited_at?: string | null
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      rent_history_records: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          landlord_name: string
          landlord_phone: string
          months_paid: number
          property_location: string
          rejection_reason: string | null
          rent_amount: number
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          landlord_name: string
          landlord_phone: string
          months_paid?: number
          property_location: string
          rejection_reason?: string | null
          rent_amount?: number
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          landlord_name?: string
          landlord_phone?: string
          months_paid?: number
          property_location?: string
          rejection_reason?: string | null
          rent_amount?: number
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      rent_requests: {
        Row: {
          access_fee: number
          agent_id: string | null
          agent_verified: boolean | null
          agent_verified_at: string | null
          agent_verified_by: string | null
          amount_repaid: number
          approval_comment: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          daily_repayment: number
          disbursed_at: string | null
          duration_days: number
          fund_recipient_id: string | null
          fund_recipient_name: string | null
          fund_recipient_type: string | null
          fund_routed_at: string | null
          funded_at: string | null
          house_category: string | null
          id: string
          landlord_id: string
          lc1_id: string
          manager_verified: boolean | null
          manager_verified_at: string | null
          manager_verified_by: string | null
          next_roi_due_date: string | null
          number_of_payments: number | null
          rejected_reason: string | null
          rent_amount: number
          request_city: string | null
          request_country: string | null
          request_fee: number
          request_latitude: number | null
          request_longitude: number | null
          roi_payments_count: number | null
          schedule_status: string | null
          status: string | null
          supporter_id: string | null
          tenant_electricity_meter: string | null
          tenant_id: string
          tenant_no_smartphone: boolean
          tenant_water_meter: string | null
          total_repayment: number
          total_roi_paid: number | null
          updated_at: string
        }
        Insert: {
          access_fee: number
          agent_id?: string | null
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          agent_verified_by?: string | null
          amount_repaid?: number
          approval_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_repayment: number
          disbursed_at?: string | null
          duration_days: number
          fund_recipient_id?: string | null
          fund_recipient_name?: string | null
          fund_recipient_type?: string | null
          fund_routed_at?: string | null
          funded_at?: string | null
          house_category?: string | null
          id?: string
          landlord_id: string
          lc1_id: string
          manager_verified?: boolean | null
          manager_verified_at?: string | null
          manager_verified_by?: string | null
          next_roi_due_date?: string | null
          number_of_payments?: number | null
          rejected_reason?: string | null
          rent_amount: number
          request_city?: string | null
          request_country?: string | null
          request_fee: number
          request_latitude?: number | null
          request_longitude?: number | null
          roi_payments_count?: number | null
          schedule_status?: string | null
          status?: string | null
          supporter_id?: string | null
          tenant_electricity_meter?: string | null
          tenant_id: string
          tenant_no_smartphone?: boolean
          tenant_water_meter?: string | null
          total_repayment: number
          total_roi_paid?: number | null
          updated_at?: string
        }
        Update: {
          access_fee?: number
          agent_id?: string | null
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          agent_verified_by?: string | null
          amount_repaid?: number
          approval_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_repayment?: number
          disbursed_at?: string | null
          duration_days?: number
          fund_recipient_id?: string | null
          fund_recipient_name?: string | null
          fund_recipient_type?: string | null
          fund_routed_at?: string | null
          funded_at?: string | null
          house_category?: string | null
          id?: string
          landlord_id?: string
          lc1_id?: string
          manager_verified?: boolean | null
          manager_verified_at?: string | null
          manager_verified_by?: string | null
          next_roi_due_date?: string | null
          number_of_payments?: number | null
          rejected_reason?: string | null
          rent_amount?: number
          request_city?: string | null
          request_country?: string | null
          request_fee?: number
          request_latitude?: number | null
          request_longitude?: number | null
          roi_payments_count?: number | null
          schedule_status?: string | null
          status?: string | null
          supporter_id?: string | null
          tenant_electricity_meter?: string | null
          tenant_id?: string
          tenant_no_smartphone?: boolean
          tenant_water_meter?: string | null
          total_repayment?: number
          total_roi_paid?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_requests_agent_verified_by_fkey"
            columns: ["agent_verified_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rent_requests_agent_verified_by_fkey"
            columns: ["agent_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_requests_agent_verified_by_fkey"
            columns: ["agent_verified_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rent_requests_agent_verified_by_fkey"
            columns: ["agent_verified_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rent_requests_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_requests_lc1_id_fkey"
            columns: ["lc1_id"]
            isOneToOne: false
            referencedRelation: "lc1_chairpersons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_requests_manager_verified_by_fkey"
            columns: ["manager_verified_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rent_requests_manager_verified_by_fkey"
            columns: ["manager_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_requests_manager_verified_by_fkey"
            columns: ["manager_verified_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rent_requests_manager_verified_by_fkey"
            columns: ["manager_verified_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      repayments: {
        Row: {
          amount: number
          created_at: string
          id: string
          rent_request_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          rent_request_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          rent_request_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repayments_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      review_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          review_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          review_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_responses: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          response_text: string
          review_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          response_text: string
          review_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          response_text?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string | null
          created_by: string | null
          department: string
          employee_id: string
          id: string
          must_change_password: boolean | null
          position: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department?: string
          employee_id: string
          id?: string
          must_change_password?: boolean | null
          position?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department?: string
          employee_id?: string
          id?: string
          must_change_password?: boolean | null
          position?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_charge_logs: {
        Row: {
          amount_deducted: number
          charge_amount: number
          charge_date: string
          created_at: string
          debt_added: number
          id: string
          status: string
          subscription_id: string
          tenant_id: string
          wallet_balance_after: number | null
          wallet_balance_before: number | null
        }
        Insert: {
          amount_deducted?: number
          charge_amount: number
          charge_date?: string
          created_at?: string
          debt_added?: number
          id?: string
          status: string
          subscription_id: string
          tenant_id: string
          wallet_balance_after?: number | null
          wallet_balance_before?: number | null
        }
        Update: {
          amount_deducted?: number
          charge_amount?: number
          charge_date?: string
          created_at?: string
          debt_added?: number
          id?: string
          status?: string
          subscription_id?: string
          tenant_id?: string
          wallet_balance_after?: number | null
          wallet_balance_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_charge_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_charges: {
        Row: {
          accumulated_debt: number
          agent_charge_count: number
          agent_charged_amount: number
          agent_id: string | null
          charge_agent_wallet: boolean
          charge_amount: number
          charges_completed: number
          charges_remaining: number
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          next_charge_date: string
          rent_request_id: string | null
          service_type: string
          start_date: string
          status: string
          tenant_failed_at: string | null
          tenant_id: string
          total_charged: number
          total_charges_due: number
          updated_at: string
        }
        Insert: {
          accumulated_debt?: number
          agent_charge_count?: number
          agent_charged_amount?: number
          agent_id?: string | null
          charge_agent_wallet?: boolean
          charge_amount: number
          charges_completed?: number
          charges_remaining?: number
          created_at?: string
          end_date?: string | null
          frequency: string
          id?: string
          next_charge_date: string
          rent_request_id?: string | null
          service_type?: string
          start_date?: string
          status?: string
          tenant_failed_at?: string | null
          tenant_id: string
          total_charged?: number
          total_charges_due?: number
          updated_at?: string
        }
        Update: {
          accumulated_debt?: number
          agent_charge_count?: number
          agent_charged_amount?: number
          agent_id?: string | null
          charge_agent_wallet?: boolean
          charge_amount?: number
          charges_completed?: number
          charges_remaining?: number
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          next_charge_date?: string
          rent_request_id?: string | null
          service_type?: string
          start_date?: string
          status?: string
          tenant_failed_at?: string | null
          tenant_id?: string
          total_charged?: number
          total_charges_due?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_charges_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_agreement_acceptance: {
        Row: {
          accepted_at: string
          agreement_version: string
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          status: string
          supporter_id: string
        }
        Insert: {
          accepted_at?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
          supporter_id: string
        }
        Update: {
          accepted_at?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
          supporter_id?: string
        }
        Relationships: []
      }
      supporter_invites: {
        Row: {
          account_name: string | null
          account_number: string | null
          activated_at: string | null
          activated_user_id: string | null
          activation_token: string
          bank_name: string | null
          country: string | null
          created_at: string
          created_by: string
          district_city: string | null
          email: string
          full_name: string
          id: string
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          mobile_money_number: string | null
          mobile_network: string | null
          national_id: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          next_of_kin_relationship: string | null
          parent_agent_id: string | null
          payment_method: string | null
          phone: string
          property_address: string | null
          role: string
          status: string
          temp_password: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          activated_at?: string | null
          activated_user_id?: string | null
          activation_token?: string
          bank_name?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          district_city?: string | null
          email: string
          full_name: string
          id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          mobile_money_number?: string | null
          mobile_network?: string | null
          national_id?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          parent_agent_id?: string | null
          payment_method?: string | null
          phone: string
          property_address?: string | null
          role?: string
          status?: string
          temp_password?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          activated_at?: string | null
          activated_user_id?: string | null
          activation_token?: string
          bank_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          district_city?: string | null
          email?: string
          full_name?: string
          id?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          mobile_money_number?: string | null
          mobile_network?: string | null
          national_id?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          parent_agent_id?: string | null
          payment_method?: string | null
          phone?: string
          property_address?: string | null
          role?: string
          status?: string
          temp_password?: string | null
        }
        Relationships: []
      }
      supporter_referrals: {
        Row: {
          bonus_amount: number | null
          bonus_credited: boolean | null
          bonus_credited_at: string | null
          created_at: string
          first_investment_at: string | null
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          bonus_amount?: number | null
          bonus_credited?: boolean | null
          bonus_credited_at?: string | null
          created_at?: string
          first_investment_at?: string | null
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          bonus_amount?: number | null
          bonus_credited?: boolean | null
          bonus_credited_at?: string | null
          created_at?: string
          first_investment_at?: string | null
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      supporter_roi_payments: {
        Row: {
          created_at: string
          due_date: string
          id: string
          paid_at: string | null
          payment_number: number
          rent_amount: number
          rent_request_id: string
          roi_amount: number
          status: string
          supporter_id: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          paid_at?: string | null
          payment_number?: number
          rent_amount: number
          rent_request_id: string
          roi_amount: number
          status?: string
          supporter_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          payment_number?: number
          rent_amount?: number
          rent_request_id?: string
          roi_amount?: number
          status?: string
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_roi_payments_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          created_at: string | null
          event_type: Database["public"]["Enums"]["system_event_type"]
          id: string
          metadata: Json | null
          processed: boolean | null
          processed_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: Database["public"]["Enums"]["system_event_type"]
          id?: string
          metadata?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["system_event_type"]
          id?: string
          metadata?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tenant_agreement_acceptance: {
        Row: {
          accepted_at: string
          agreement_version: string
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_merchant_payments: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          id: string
          merchant_name: string
          notes: string | null
          payment_date: string
          tenant_id: string | null
          tenant_phone: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          id?: string
          merchant_name: string
          notes?: string | null
          payment_date?: string
          tenant_id?: string | null
          tenant_phone?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          id?: string
          merchant_name?: string
          notes?: string | null
          payment_date?: string
          tenant_id?: string | null
          tenant_phone?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_ratings: {
        Row: {
          created_at: string
          id: string
          landlord_id: string
          rating: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          landlord_id: string
          rating: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          landlord_id?: string
          rating?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_replacements: {
        Row: {
          created_at: string
          id: string
          landlord_id: string
          new_tenant_id: string
          old_tenant_id: string
          outstanding_balance: number
          reason: string
          rent_request_id: string
          replaced_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          landlord_id: string
          new_tenant_id: string
          old_tenant_id: string
          outstanding_balance?: number
          reason?: string
          rent_request_id: string
          replaced_by: string
        }
        Update: {
          created_at?: string
          id?: string
          landlord_id?: string
          new_tenant_id?: string
          old_tenant_id?: string
          outstanding_balance?: number
          reason?: string
          rent_request_id?: string
          replaced_by?: string
        }
        Relationships: []
      }
      transaction_approvals: {
        Row: {
          approval_id: string
          approval_notes: string | null
          approved_at: string
          approved_by: string
          transaction_id: string | null
        }
        Insert: {
          approval_id?: string
          approval_notes?: string | null
          approved_at?: string
          approved_by: string
          transaction_id?: string | null
        }
        Update: {
          approval_id?: string
          approval_notes?: string | null
          approved_at?: string
          approved_by?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_approvals_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          performed_by: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_loan_repayments: {
        Row: {
          amount: number
          borrower_id: string
          created_at: string
          id: string
          loan_id: string
          payment_method: string
        }
        Insert: {
          amount: number
          borrower_id: string
          created_at?: string
          id?: string
          loan_id: string
          payment_method?: string
        }
        Update: {
          amount?: number
          borrower_id?: string
          created_at?: string
          id?: string
          loan_id?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "user_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_loans: {
        Row: {
          agent_verified: boolean | null
          agent_verified_at: string | null
          agent_verified_by: string | null
          ai_insurance_accepted: boolean | null
          ai_insurance_accepted_at: string | null
          amount: number
          borrower_id: string
          created_at: string
          due_date: string
          id: string
          interest_rate: number
          lender_id: string
          paid_amount: number
          repaid_at: string | null
          repayment_frequency: string | null
          status: string
          total_repayment: number
        }
        Insert: {
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          agent_verified_by?: string | null
          ai_insurance_accepted?: boolean | null
          ai_insurance_accepted_at?: string | null
          amount: number
          borrower_id: string
          created_at?: string
          due_date: string
          id?: string
          interest_rate?: number
          lender_id: string
          paid_amount?: number
          repaid_at?: string | null
          repayment_frequency?: string | null
          status?: string
          total_repayment: number
        }
        Update: {
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          agent_verified_by?: string | null
          ai_insurance_accepted?: boolean | null
          ai_insurance_accepted_at?: string | null
          amount?: number
          borrower_id?: string
          created_at?: string
          due_date?: string
          id?: string
          interest_rate?: number
          lender_id?: string
          paid_amount?: number
          repaid_at?: string | null
          repayment_frequency?: string | null
          status?: string
          total_repayment?: number
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          accuracy: number | null
          address: string | null
          captured_at: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          user_id: string
          verification_notes: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          accuracy?: number | null
          address?: string | null
          captured_at?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          user_id: string
          verification_notes?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          accuracy?: number | null
          address?: string | null
          captured_at?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          user_id?: string
          verification_notes?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      user_receipts: {
        Row: {
          claimed_amount: number
          created_at: string
          id: string
          items_description: string
          loan_contribution: number | null
          receipt_number_id: string
          rejection_reason: string | null
          user_id: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          claimed_amount: number
          created_at?: string
          id?: string
          items_description: string
          loan_contribution?: number | null
          receipt_number_id: string
          rejection_reason?: string | null
          user_id: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          claimed_amount?: number
          created_at?: string
          id?: string
          items_description?: string
          loan_contribution?: number | null
          receipt_number_id?: string
          rejection_reason?: string | null
          user_id?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_receipts_receipt_number_id_fkey"
            columns: ["receipt_number_id"]
            isOneToOne: true
            referencedRelation: "receipt_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reviews: {
        Row: {
          created_at: string
          id: string
          rating: number
          review_text: string | null
          reviewed_user_id: string
          reviewer_id: string
          reviewer_role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          reviewed_user_id: string
          reviewer_id: string
          reviewer_role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
          reviewed_user_id?: string
          reviewer_id?: string
          reviewer_role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_risk_scores: {
        Row: {
          consecutive_missed_payments: number | null
          consecutive_on_time_payments: number | null
          created_at: string | null
          id: string
          last_payment_date: string | null
          last_risk_update: string | null
          notes: string | null
          risk_level: string | null
          risk_score: number | null
          total_missed_payments: number | null
          total_on_time_payments: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consecutive_missed_payments?: number | null
          consecutive_on_time_payments?: number | null
          created_at?: string | null
          id?: string
          last_payment_date?: string | null
          last_risk_update?: string | null
          notes?: string | null
          risk_level?: string | null
          risk_score?: number | null
          total_missed_payments?: number | null
          total_on_time_payments?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consecutive_missed_payments?: number | null
          consecutive_on_time_payments?: number | null
          created_at?: string | null
          id?: string
          last_payment_date?: string | null
          last_risk_update?: string | null
          notes?: string | null
          risk_level?: string | null
          risk_score?: number | null
          total_missed_payments?: number | null
          total_on_time_payments?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          location: string | null
          name: string
          phone: string | null
          pin: string | null
          pin_hash: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          location?: string | null
          name: string
          phone?: string | null
          pin?: string | null
          pin_hash?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          location?: string | null
          name?: string
          phone?: string | null
          pin?: string | null
          pin_hash?: string | null
        }
        Relationships: []
      }
      voided_ledger_entries: {
        Row: {
          account: string | null
          amount: number
          category: string
          created_at: string
          description: string | null
          direction: string
          id: string
          linked_party: string | null
          original_ledger_id: string
          reference_id: string | null
          running_balance: number | null
          source_id: string | null
          source_table: string
          transaction_date: string
          transaction_group_id: string | null
          user_id: string | null
          void_reason: string
          voided_at: string
          voided_by: string
        }
        Insert: {
          account?: string | null
          amount: number
          category: string
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          linked_party?: string | null
          original_ledger_id: string
          reference_id?: string | null
          running_balance?: number | null
          source_id?: string | null
          source_table: string
          transaction_date: string
          transaction_group_id?: string | null
          user_id?: string | null
          void_reason: string
          voided_at?: string
          voided_by: string
        }
        Update: {
          account?: string | null
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          linked_party?: string | null
          original_ledger_id?: string
          reference_id?: string | null
          running_balance?: number | null
          source_id?: string | null
          source_table?: string
          transaction_date?: string
          transaction_group_id?: string | null
          user_id?: string | null
          void_reason?: string
          voided_at?: string
          voided_by?: string
        }
        Relationships: []
      }
      wallet_deposits: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          deposit_type: string
          id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          deposit_type?: string
          id?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          deposit_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          recipient_id: string
          sender_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          recipient_id: string
          sender_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      welile_homes_subscriptions: {
        Row: {
          created_at: string
          email_statements_enabled: boolean | null
          id: string
          landlord_id: string | null
          landlord_registered: boolean
          last_interest_applied_at: string | null
          last_statement_sent_at: string | null
          monthly_rent: number
          months_enrolled: number
          notes: string | null
          subscription_status: string
          tenant_id: string
          total_savings: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_statements_enabled?: boolean | null
          id?: string
          landlord_id?: string | null
          landlord_registered?: boolean
          last_interest_applied_at?: string | null
          last_statement_sent_at?: string | null
          monthly_rent?: number
          months_enrolled?: number
          notes?: string | null
          subscription_status?: string
          tenant_id: string
          total_savings?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_statements_enabled?: boolean | null
          id?: string
          landlord_id?: string | null
          landlord_registered?: boolean
          last_interest_applied_at?: string | null
          last_statement_sent_at?: string | null
          monthly_rent?: number
          months_enrolled?: number
          notes?: string | null
          subscription_status?: string
          tenant_id?: string
          total_savings?: number
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          cfo_approved_at: string | null
          cfo_approved_by: string | null
          coo_approved_at: string | null
          coo_approved_by: string | null
          created_at: string
          id: string
          manager_approved_at: string | null
          manager_approved_by: string | null
          mobile_money_name: string | null
          mobile_money_number: string | null
          mobile_money_provider: string | null
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          coo_approved_at?: string | null
          coo_approved_by?: string | null
          created_at?: string
          id?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          coo_approved_at?: string | null
          coo_approved_by?: string | null
          created_at?: string
          id?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      manager_profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          phone: string | null
          user_id: string | null
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          active_disbursements: number | null
          refreshed_at: string | null
          total_agents: number | null
          total_disbursed_amount: number | null
          total_landlords: number | null
          total_rent_requests: number | null
          total_supporters: number | null
          total_tenants: number | null
          total_users: number | null
        }
        Relationships: []
      }
      referral_leaderboard: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          referral_count: number | null
          total_earned: number | null
          user_id: string | null
        }
        Relationships: []
      }
      supporter_referral_leaderboard: {
        Row: {
          avatar_url: string | null
          converted_count: number | null
          full_name: string | null
          referral_count: number | null
          total_earned: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_financial_summaries: {
        Row: {
          ai_id: string | null
          estimated_borrowing_limit: number | null
          funded_requests: number | null
          last_refreshed_at: string | null
          member_since: string | null
          on_time_payment_rate: number | null
          referral_count: number | null
          risk_level: string | null
          risk_score: number | null
          total_missed_payments: number | null
          total_on_time_payments: number | null
          total_rent_facilitated: number | null
          total_rent_requests: number | null
          user_id: string | null
          wallet_balance: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_welile_homes_monthly_interest: { Args: never; Returns: number }
      check_phone_exists: {
        Args: { phone_suffix: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_system_events: { Args: never; Returns: undefined }
      create_direct_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      decrement_rent_requested: {
        Args: { p_amount: number; p_summary_id: string }
        Returns: undefined
      }
      find_duplicate_phones: {
        Args: never
        Returns: {
          normalized_phone: string
          user_count: number
          user_ids: string[]
        }[]
      }
      generate_employee_id: { Args: { _full_name: string }; Returns: string }
      generate_portfolio_code: { Args: never; Returns: string }
      generate_welile_ai_id: { Args: { user_uuid: string }; Returns: string }
      get_buffer_metrics: { Args: never; Returns: Json }
      get_buffer_trend_data: { Args: never; Returns: Json }
      get_deposits_paginated: {
        Args: {
          p_agent_id?: string
          p_end_date?: string
          p_max_amount?: number
          p_min_amount?: number
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_start_date?: string
          p_status?: string
        }
        Returns: Json
      }
      get_email_by_phone: {
        Args: { phone_variants: string[] }
        Returns: {
          email: string
        }[]
      }
      get_ledger_balance: { Args: { p_user_id: string }; Returns: number }
      get_ledger_summary: {
        Args: {
          p_category?: string
          p_direction?: string
          p_end_date?: string
          p_search?: string
          p_start_date?: string
        }
        Returns: {
          entry_count: number
          total_credits: number
          total_debits: number
        }[]
      }
      get_manager_daily_report: { Args: never; Returns: Json }
      get_manager_dashboard_stats: { Args: never; Returns: Json }
      get_manager_productivity:
        | {
            Args: { filter_end?: string; filter_start?: string }
            Returns: Json
          }
        | {
            Args: {
              p_custom_end?: string
              p_custom_start?: string
              p_filter: string
            }
            Returns: Json
          }
      get_manager_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          phone: string
          user_id: string
        }[]
      }
      get_my_ai_id_summary: { Args: never; Returns: Json }
      get_pending_wallet_ops: {
        Args: { p_page?: number; p_page_size?: number }
        Returns: Json
      }
      get_rent_requests_summary: { Args: never; Returns: Json }
      get_supporter_pool_stats: { Args: never; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_wallet_ops_stats: { Args: { p_period?: string }; Returns: Json }
      has_dashboard_access: {
        Args: { _dashboard: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_supporter: { Args: never; Returns: boolean }
      log_system_event: {
        Args: {
          p_event_type: Database["public"]["Enums"]["system_event_type"]
          p_metadata?: Json
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_user_id: string
        }
        Returns: string
      }
      lookup_ai_id: { Args: { p_ai_id: string }; Returns: Json }
      lookup_profile_by_phone_last9: {
        Args: { phone_last9: string }
        Returns: {
          email: string
          phone: string
        }[]
      }
      normalize_phone_last9: { Args: { phone: string }; Returns: string }
      notify_landlord_registration_helper: {
        Args: { p_landlord_id: string }
        Returns: undefined
      }
      process_monthly_referral_rewards: { Args: never; Returns: undefined }
      recalculate_credit_limit: { Args: { p_user_id: string }; Returns: number }
      record_double_entry: {
        Args: {
          p_amount: number
          p_category: string
          p_credit_account?: string
          p_credit_user_id: string
          p_debit_account?: string
          p_debit_user_id: string
          p_description: string
          p_linked_party?: string
          p_reference_id?: string
          p_source_id?: string
          p_source_table: string
        }
        Returns: string
      }
      record_rent_payment: {
        Args: { p_amount: number; p_landlord_id: string }
        Returns: undefined
      }
      record_rent_request_repayment: {
        Args: { p_amount: number; p_tenant_id: string }
        Returns: undefined
      }
      refresh_financial_summaries: { Args: never; Returns: undefined }
      reset_agent_float_if_stale: {
        Args: { p_agent_id: string }
        Returns: undefined
      }
      resolve_welile_ai_id: { Args: { ai_id: string }; Returns: string }
      search_agents: {
        Args: { result_limit?: number; search_term?: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      search_supporters: {
        Args: { result_limit?: number; search_term: string }
        Returns: {
          full_name: string
          id: string
          phone: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_user_risk_score: {
        Args: { p_reason?: string; p_score_change: number; p_user_id: string }
        Returns: number
      }
      validate_and_record_collection: {
        Args: {
          p_agent_id: string
          p_payment_method: string
          p_token_code: string
        }
        Returns: Json
      }
      void_ledger_entry: {
        Args: { p_ledger_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_priority: "low" | "medium" | "high" | "critical"
      ai_recommendation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "auto_executed"
        | "expired"
      app_role:
        | "tenant"
        | "agent"
        | "landlord"
        | "supporter"
        | "manager"
        | "ceo"
        | "coo"
        | "cfo"
        | "cto"
        | "cmo"
        | "crm"
        | "employee"
        | "operations"
        | "super_admin"
      automation_action_type:
        | "send_notification"
        | "send_push"
        | "update_risk_score"
        | "flag_account"
        | "unflag_account"
        | "send_reminder"
        | "escalate_to_manager"
        | "apply_late_fee"
        | "restrict_access"
      collection_payment_method: "mobile_money" | "cash" | "in_app_wallet"
      flag_severity: "low" | "medium" | "high" | "critical"
      system_event_type:
        | "payment_missed"
        | "payment_made"
        | "payment_overdue"
        | "tenant_created"
        | "agent_created"
        | "supporter_created"
        | "funds_added"
        | "funds_withdrawn"
        | "rent_request_created"
        | "rent_request_approved"
        | "rent_request_funded"
        | "rent_request_disbursed"
        | "account_activated"
        | "account_inactive"
        | "risk_score_changed"
        | "account_flagged"
        | "reminder_sent"
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
      ai_priority: ["low", "medium", "high", "critical"],
      ai_recommendation_status: [
        "pending",
        "approved",
        "rejected",
        "auto_executed",
        "expired",
      ],
      app_role: [
        "tenant",
        "agent",
        "landlord",
        "supporter",
        "manager",
        "ceo",
        "coo",
        "cfo",
        "cto",
        "cmo",
        "crm",
        "employee",
        "operations",
        "super_admin",
      ],
      automation_action_type: [
        "send_notification",
        "send_push",
        "update_risk_score",
        "flag_account",
        "unflag_account",
        "send_reminder",
        "escalate_to_manager",
        "apply_late_fee",
        "restrict_access",
      ],
      collection_payment_method: ["mobile_money", "cash", "in_app_wallet"],
      flag_severity: ["low", "medium", "high", "critical"],
      system_event_type: [
        "payment_missed",
        "payment_made",
        "payment_overdue",
        "tenant_created",
        "agent_created",
        "supporter_created",
        "funds_added",
        "funds_withdrawn",
        "rent_request_created",
        "rent_request_approved",
        "rent_request_funded",
        "rent_request_disbursed",
        "account_activated",
        "account_inactive",
        "risk_score_changed",
        "account_flagged",
        "reminder_sent",
      ],
    },
  },
} as const
