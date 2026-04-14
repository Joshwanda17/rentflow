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
          monthly_rate: number
          topped_up_by: string
        }
        Insert: {
          advance_id: string
          amount: number
          created_at?: string
          id?: string
          monthly_rate?: number
          topped_up_by: string
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          id?: string
          monthly_rate?: number
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
          access_fee: number | null
          access_fee_collected: number | null
          access_fee_status: string | null
          agent_id: string
          created_at: string
          cycle_days: number
          daily_rate: number
          expires_at: string
          id: string
          issued_at: string
          issued_by: string
          monthly_rate: number
          outstanding_balance: number
          principal: number
          registration_fee: number | null
          status: string
          updated_at: string
        }
        Insert: {
          access_fee?: number | null
          access_fee_collected?: number | null
          access_fee_status?: string | null
          agent_id: string
          created_at?: string
          cycle_days?: number
          daily_rate?: number
          expires_at?: string
          id?: string
          issued_at?: string
          issued_by: string
          monthly_rate?: number
          outstanding_balance?: number
          principal?: number
          registration_fee?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_fee?: number | null
          access_fee_collected?: number | null
          access_fee_status?: string | null
          agent_id?: string
          created_at?: string
          cycle_days?: number
          daily_rate?: number
          expires_at?: string
          id?: string
          issued_at?: string
          issued_by?: string
          monthly_rate?: number
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
      agent_collection_streaks: {
        Row: {
          agent_id: string
          badges: Json | null
          current_streak: number | null
          id: string
          last_collection_date: string | null
          longest_streak: number | null
          streak_multiplier: number | null
          total_badges: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          badges?: Json | null
          current_streak?: number | null
          id?: string
          last_collection_date?: string | null
          longest_streak?: number | null
          streak_multiplier?: number | null
          total_badges?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          badges?: Json | null
          current_streak?: number | null
          id?: string
          last_collection_date?: string | null
          longest_streak?: number | null
          streak_multiplier?: number | null
          total_badges?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_collection_streaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collection_streaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_collection_streaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_collection_streaks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
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
      agent_delivery_confirmations: {
        Row: {
          agent_id: string
          confirmation_type: string
          confirmed_at: string
          created_at: string
          disbursement_id: string
          id: string
          landlord_signature_url: string | null
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          notes: string | null
          photo_urls: string[] | null
          rent_request_id: string
        }
        Insert: {
          agent_id: string
          confirmation_type?: string
          confirmed_at?: string
          created_at?: string
          disbursement_id: string
          id?: string
          landlord_signature_url?: string | null
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          notes?: string | null
          photo_urls?: string[] | null
          rent_request_id: string
        }
        Update: {
          agent_id?: string
          confirmation_type?: string
          confirmed_at?: string
          created_at?: string
          disbursement_id?: string
          id?: string
          landlord_signature_url?: string | null
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          notes?: string | null
          photo_urls?: string[] | null
          rent_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_delivery_confirmations_disbursement_id_fkey"
            columns: ["disbursement_id"]
            isOneToOne: false
            referencedRelation: "disbursement_records"
            referencedColumns: ["id"]
          },
        ]
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
      agent_escalations: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          escalation_type: string
          id: string
          metadata: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          escalation_type: string
          id?: string
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          escalation_type?: string
          id?: string
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_escalations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_escalations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_float_funding: {
        Row: {
          agent_id: string
          amount: number
          bank_name: string | null
          bank_reference: string | null
          created_at: string
          funded_by: string | null
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          agent_id: string
          amount: number
          bank_name?: string | null
          bank_reference?: string | null
          created_at?: string
          funded_by?: string | null
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          bank_name?: string | null
          bank_reference?: string | null
          created_at?: string
          funded_by?: string | null
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_float_funding_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_funding_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_funding_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_funding_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_funding_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_funding_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_funding_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_funding_funded_by_fkey"
            columns: ["funded_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      agent_float_withdrawals: {
        Row: {
          agent_id: string
          agent_latitude: number | null
          agent_location_accuracy: number | null
          agent_longitude: number | null
          agent_ops_notes: string | null
          agent_ops_reviewed_at: string | null
          agent_ops_reviewed_by: string | null
          amount: number
          created_at: string
          gps_distance_meters: number | null
          gps_match: boolean | null
          id: string
          landlord_id: string
          landlord_latitude: number | null
          landlord_location_accuracy: number | null
          landlord_longitude: number | null
          landlord_name: string
          landlord_phone: string
          manager_notes: string | null
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          mobile_money_provider: string
          notes: string | null
          property_latitude: number | null
          property_longitude: number | null
          receipt_photo_urls: string[] | null
          rent_request_id: string
          status: string
          tenant_id: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_latitude?: number | null
          agent_location_accuracy?: number | null
          agent_longitude?: number | null
          agent_ops_notes?: string | null
          agent_ops_reviewed_at?: string | null
          agent_ops_reviewed_by?: string | null
          amount: number
          created_at?: string
          gps_distance_meters?: number | null
          gps_match?: boolean | null
          id?: string
          landlord_id: string
          landlord_latitude?: number | null
          landlord_location_accuracy?: number | null
          landlord_longitude?: number | null
          landlord_name: string
          landlord_phone: string
          manager_notes?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          mobile_money_provider: string
          notes?: string | null
          property_latitude?: number | null
          property_longitude?: number | null
          receipt_photo_urls?: string[] | null
          rent_request_id: string
          status?: string
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_latitude?: number | null
          agent_location_accuracy?: number | null
          agent_longitude?: number | null
          agent_ops_notes?: string | null
          agent_ops_reviewed_at?: string | null
          agent_ops_reviewed_by?: string | null
          amount?: number
          created_at?: string
          gps_distance_meters?: number | null
          gps_match?: boolean | null
          id?: string
          landlord_id?: string
          landlord_latitude?: number | null
          landlord_location_accuracy?: number | null
          landlord_longitude?: number | null
          landlord_name?: string
          landlord_phone?: string
          manager_notes?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          mobile_money_provider?: string
          notes?: string | null
          property_latitude?: number | null
          property_longitude?: number | null
          receipt_photo_urls?: string[] | null
          rent_request_id?: string
          status?: string
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_float_withdrawals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_ops_reviewed_by_fkey"
            columns: ["agent_ops_reviewed_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_ops_reviewed_by_fkey"
            columns: ["agent_ops_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_ops_reviewed_by_fkey"
            columns: ["agent_ops_reviewed_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_agent_ops_reviewed_by_fkey"
            columns: ["agent_ops_reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_manager_reviewed_by_fkey"
            columns: ["manager_reviewed_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_manager_reviewed_by_fkey"
            columns: ["manager_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_manager_reviewed_by_fkey"
            columns: ["manager_reviewed_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_manager_reviewed_by_fkey"
            columns: ["manager_reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_float_withdrawals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_form_tokens: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          max_uses: number
          token: string
          uses_count: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number
          token: string
          uses_count?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number
          token?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_form_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_form_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_form_tokens_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_form_tokens_agent_id_fkey"
            columns: ["agent_id"]
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
      agent_incentive_bonuses: {
        Row: {
          agent_id: string
          amount: number | null
          awarded_at: string | null
          bonus_type: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          agent_id: string
          amount?: number | null
          awarded_at?: string | null
          bonus_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          agent_id?: string
          amount?: number | null
          awarded_at?: string | null
          bonus_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_incentive_bonuses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_incentive_bonuses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_incentive_bonuses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_incentive_bonuses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_landlord_assignments: {
        Row: {
          agent_id: string
          assigned_at: string
          created_at: string
          id: string
          landlord_id: string
          rent_request_id: string | null
          status: string
        }
        Insert: {
          agent_id: string
          assigned_at?: string
          created_at?: string
          id?: string
          landlord_id: string
          rent_request_id?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          assigned_at?: string
          created_at?: string
          id?: string
          landlord_id?: string
          rent_request_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_landlord_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_landlord_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_assignments_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_landlord_assignments_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_landlord_float: {
        Row: {
          agent_id: string
          balance: number
          created_at: string
          id: string
          total_funded: number
          total_paid_out: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          balance?: number
          created_at?: string
          id?: string
          total_funded?: number
          total_paid_out?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          balance?: number
          created_at?: string
          id?: string
          total_funded?: number
          total_paid_out?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_landlord_float_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_float_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_landlord_float_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_float_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_landlord_payouts: {
        Row: {
          agent_id: string | null
          amount: number
          cfo_approved_at: string | null
          cfo_approved_by: string | null
          cfo_notes: string | null
          created_at: string
          gps_distance_meters: number | null
          gps_match: boolean | null
          id: string
          landlord_id: string
          landlord_name: string
          landlord_ops_approved_at: string | null
          landlord_ops_approved_by: string | null
          landlord_ops_notes: string | null
          landlord_phone: string
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          mobile_money_provider: string
          notes: string | null
          property_latitude: number | null
          property_longitude: number | null
          receipt_photo_urls: string[] | null
          rejection_reason: string | null
          rent_request_id: string
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          amount: number
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          cfo_notes?: string | null
          created_at?: string
          gps_distance_meters?: number | null
          gps_match?: boolean | null
          id?: string
          landlord_id: string
          landlord_name: string
          landlord_ops_approved_at?: string | null
          landlord_ops_approved_by?: string | null
          landlord_ops_notes?: string | null
          landlord_phone: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          mobile_money_provider: string
          notes?: string | null
          property_latitude?: number | null
          property_longitude?: number | null
          receipt_photo_urls?: string[] | null
          rejection_reason?: string | null
          rent_request_id: string
          status?: string
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          amount?: number
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          cfo_notes?: string | null
          created_at?: string
          gps_distance_meters?: number | null
          gps_match?: boolean | null
          id?: string
          landlord_id?: string
          landlord_name?: string
          landlord_ops_approved_at?: string | null
          landlord_ops_approved_by?: string | null
          landlord_ops_notes?: string | null
          landlord_phone?: string
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          mobile_money_provider?: string
          notes?: string | null
          property_latitude?: number | null
          property_longitude?: number | null
          receipt_photo_urls?: string[] | null
          rejection_reason?: string | null
          rent_request_id?: string
          status?: string
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_landlord_payouts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_payouts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_landlord_payouts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_landlord_payouts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
          rejection_reason: string | null
          source: string
          status: string
          sub_agent_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          parent_agent_id: string
          rejection_reason?: string | null
          source?: string
          status?: string
          sub_agent_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          parent_agent_id?: string
          rejection_reason?: string | null
          source?: string
          status?: string
          sub_agent_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_subagents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_subagents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_subagents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_subagents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_id: string
          assigned_by: string | null
          completed_at: string | null
          completion_latitude: number | null
          completion_longitude: number | null
          completion_notes: string | null
          created_at: string
          description: string | null
          due_date: string | null
          gps_required: boolean | null
          id: string
          priority: string
          rent_request_id: string | null
          status: string
          task_type: string
          tenant_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          assigned_by?: string | null
          completed_at?: string | null
          completion_latitude?: number | null
          completion_longitude?: number | null
          completion_notes?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          gps_required?: boolean | null
          id?: string
          priority?: string
          rent_request_id?: string | null
          status?: string
          task_type?: string
          tenant_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assigned_by?: string | null
          completed_at?: string | null
          completion_latitude?: number | null
          completion_longitude?: number | null
          completion_notes?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          gps_required?: boolean | null
          id?: string
          priority?: string
          rent_request_id?: string | null
          status?: string
          task_type?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      angel_pool_config: {
        Row: {
          id: string
          pool_equity_percent: number
          price_per_share: number
          total_pool_ugx: number
          total_shares: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          pool_equity_percent?: number
          price_per_share?: number
          total_pool_ugx?: number
          total_shares?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          pool_equity_percent?: number
          price_per_share?: number
          total_pool_ugx?: number
          total_shares?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      angel_pool_investments: {
        Row: {
          agent_id: string | null
          amount: number
          company_ownership_percent: number
          created_at: string
          id: string
          investment_reference: string | null
          investor_id: string
          payment_method: string | null
          pool_ownership_percent: number
          reference_id: string | null
          shares: number
          status: string
          transaction_group_id: string | null
        }
        Insert: {
          agent_id?: string | null
          amount: number
          company_ownership_percent: number
          created_at?: string
          id?: string
          investment_reference?: string | null
          investor_id: string
          payment_method?: string | null
          pool_ownership_percent: number
          reference_id?: string | null
          shares: number
          status?: string
          transaction_group_id?: string | null
        }
        Update: {
          agent_id?: string | null
          amount?: number
          company_ownership_percent?: number
          created_at?: string
          id?: string
          investment_reference?: string | null
          investor_id?: string
          payment_method?: string | null
          pool_ownership_percent?: number
          reference_id?: string | null
          shares?: number
          status?: string
          transaction_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "angel_pool_investments_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "angel_pool_investments_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "angel_pool_investments_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "angel_pool_investments_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          action_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          action_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
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
      cashout_agents: {
        Row: {
          agent_id: string
          assigned_by: string
          created_at: string
          current_queue_count: number | null
          handles_airtel: boolean | null
          handles_bank: boolean
          handles_cash: boolean
          handles_mtn: boolean | null
          id: string
          is_active: boolean
          label: string | null
          max_daily_payouts: number | null
          priority_threshold: number | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          assigned_by: string
          created_at?: string
          current_queue_count?: number | null
          handles_airtel?: boolean | null
          handles_bank?: boolean
          handles_cash?: boolean
          handles_mtn?: boolean | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_daily_payouts?: number | null
          priority_threshold?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assigned_by?: string
          created_at?: string
          current_queue_count?: number | null
          handles_airtel?: boolean | null
          handles_bank?: boolean
          handles_cash?: boolean
          handles_mtn?: boolean | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_daily_payouts?: number | null
          priority_threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashout_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cashout_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashout_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cashout_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cashout_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cashout_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashout_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cashout_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cfo_threshold_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          current_value: number | null
          description: string | null
          id: string
          severity: string
          threshold_value: number | null
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          current_value?: number | null
          description?: string | null
          id?: string
          severity?: string
          threshold_value?: number | null
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          current_value?: number | null
          description?: string | null
          id?: string
          severity?: string
          threshold_value?: number | null
          title?: string
        }
        Relationships: []
      }
      commission_accrual_ledger: {
        Row: {
          agent_id: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          commission_role: string | null
          created_at: string
          description: string | null
          earned_at: string
          event_type: string | null
          id: string
          paid_at: string | null
          percentage: number | null
          rejected_at: string | null
          rejection_reason: string | null
          rent_request_id: string | null
          repayment_amount: number | null
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          agent_id?: string | null
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          commission_role?: string | null
          created_at?: string
          description?: string | null
          earned_at?: string
          event_type?: string | null
          id?: string
          paid_at?: string | null
          percentage?: number | null
          rejected_at?: string | null
          rejection_reason?: string | null
          rent_request_id?: string | null
          repayment_amount?: number | null
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          agent_id?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          commission_role?: string | null
          created_at?: string
          description?: string | null
          earned_at?: string
          event_type?: string | null
          id?: string
          paid_at?: string | null
          percentage?: number | null
          rejected_at?: string | null
          rejection_reason?: string | null
          rent_request_id?: string | null
          repayment_amount?: number | null
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_accrual_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_accrual_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
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
      credit_access_draws: {
        Row: {
          access_fee: number
          agent_id: string | null
          amount: number
          amount_repaid: number
          completed_at: string | null
          created_at: string
          daily_charge: number
          duration_days: number | null
          duration_months: number
          expires_at: string
          id: string
          monthly_rate: number
          outstanding_balance: number
          started_at: string
          status: string
          total_payable: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_fee?: number
          agent_id?: string | null
          amount: number
          amount_repaid?: number
          completed_at?: string | null
          created_at?: string
          daily_charge?: number
          duration_days?: number | null
          duration_months?: number
          expires_at: string
          id?: string
          monthly_rate?: number
          outstanding_balance?: number
          started_at?: string
          status?: string
          total_payable?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_fee?: number
          agent_id?: string | null
          amount?: number
          amount_repaid?: number
          completed_at?: string | null
          created_at?: string
          daily_charge?: number
          duration_days?: number | null
          duration_months?: number
          expires_at?: string
          id?: string
          monthly_rate?: number
          outstanding_balance?: number
          started_at?: string
          status?: string
          total_payable?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_access_limits: {
        Row: {
          base_limit: number
          bonus_from_houses_listed: number
          bonus_from_landlord_rent: number
          bonus_from_partners_onboarded: number
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
          bonus_from_houses_listed?: number
          bonus_from_landlord_rent?: number
          bonus_from_partners_onboarded?: number
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
          bonus_from_houses_listed?: number
          bonus_from_landlord_rent?: number
          bonus_from_partners_onboarded?: number
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
      credit_draw_ledger: {
        Row: {
          agent_deducted: number
          amount_deducted: number
          closing_balance: number
          created_at: string
          daily_charge: number
          date: string
          deduction_status: string
          draw_id: string
          id: string
          opening_balance: number
        }
        Insert: {
          agent_deducted?: number
          amount_deducted?: number
          closing_balance?: number
          created_at?: string
          daily_charge?: number
          date: string
          deduction_status?: string
          draw_id: string
          id?: string
          opening_balance?: number
        }
        Update: {
          agent_deducted?: number
          amount_deducted?: number
          closing_balance?: number
          created_at?: string
          daily_charge?: number
          date?: string
          deduction_status?: string
          draw_id?: string
          id?: string
          opening_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_draw_ledger_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "credit_access_draws"
            referencedColumns: ["id"]
          },
        ]
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
      daily_platform_stats: {
        Row: {
          active_users_30d: number
          created_at: string
          daily_transaction_volume: number
          id: string
          new_users_today: number
          referral_pct: number
          retention_pct: number
          stat_date: string
          total_users: number
          updated_at: string
          users_by_role: Json | null
        }
        Insert: {
          active_users_30d?: number
          created_at?: string
          daily_transaction_volume?: number
          id?: string
          new_users_today?: number
          referral_pct?: number
          retention_pct?: number
          stat_date?: string
          total_users?: number
          updated_at?: string
          users_by_role?: Json | null
        }
        Update: {
          active_users_30d?: number
          created_at?: string
          daily_transaction_volume?: number
          id?: string
          new_users_today?: number
          referral_pct?: number
          retention_pct?: number
          stat_date?: string
          total_users?: number
          updated_at?: string
          users_by_role?: Json | null
        }
        Relationships: []
      }
      default_recovery_ledger: {
        Row: {
          agent_id: string | null
          created_at: string
          default_amount: number
          default_date: string
          id: string
          last_recovery_date: string | null
          notes: string | null
          platform_loss: number
          recovered_amount: number
          rent_request_id: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          write_off_approved_by: string | null
          write_off_date: string | null
          written_off_amount: number
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          default_amount?: number
          default_date?: string
          id?: string
          last_recovery_date?: string | null
          notes?: string | null
          platform_loss?: number
          recovered_amount?: number
          rent_request_id?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          write_off_approved_by?: string | null
          write_off_date?: string | null
          written_off_amount?: number
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          default_amount?: number
          default_date?: string
          id?: string
          last_recovery_date?: string | null
          notes?: string | null
          platform_loss?: number
          recovered_amount?: number
          rent_request_id?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          write_off_approved_by?: string | null
          write_off_date?: string | null
          written_off_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "default_recovery_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_write_off_approved_by_fkey"
            columns: ["write_off_approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_write_off_approved_by_fkey"
            columns: ["write_off_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_write_off_approved_by_fkey"
            columns: ["write_off_approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "default_recovery_ledger_write_off_approved_by_fkey"
            columns: ["write_off_approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          head_user_id: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          head_user_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          head_user_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_user_id_fkey"
            columns: ["head_user_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "departments_head_user_id_fkey"
            columns: ["head_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_head_user_id_fkey"
            columns: ["head_user_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "departments_head_user_id_fkey"
            columns: ["head_user_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      deposit_requests: {
        Row: {
          agent_id: string | null
          amount: number
          approved_at: string | null
          audit_flagged: boolean | null
          auto_approved: boolean | null
          batch_run_id: string | null
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
          audit_flagged?: boolean | null
          auto_approved?: boolean | null
          batch_run_id?: string | null
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
          audit_flagged?: boolean | null
          auto_approved?: boolean | null
          batch_run_id?: string | null
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
      disbursement_records: {
        Row: {
          agent_confirmed: boolean | null
          agent_confirmed_at: string | null
          agent_id: string | null
          amount: number
          created_at: string
          disbursed_at: string
          disbursed_by: string | null
          id: string
          landlord_confirmed: boolean | null
          landlord_confirmed_at: string | null
          landlord_id: string | null
          notes: string | null
          payout_method: string
          reconciliation_status: string
          rent_request_id: string
          tenant_id: string
          transaction_reference: string | null
        }
        Insert: {
          agent_confirmed?: boolean | null
          agent_confirmed_at?: string | null
          agent_id?: string | null
          amount: number
          created_at?: string
          disbursed_at?: string
          disbursed_by?: string | null
          id?: string
          landlord_confirmed?: boolean | null
          landlord_confirmed_at?: string | null
          landlord_id?: string | null
          notes?: string | null
          payout_method?: string
          reconciliation_status?: string
          rent_request_id: string
          tenant_id: string
          transaction_reference?: string | null
        }
        Update: {
          agent_confirmed?: boolean | null
          agent_confirmed_at?: string | null
          agent_id?: string | null
          amount?: number
          created_at?: string
          disbursed_at?: string
          disbursed_by?: string | null
          id?: string
          landlord_confirmed?: boolean | null
          landlord_confirmed_at?: string | null
          landlord_id?: string | null
          notes?: string | null
          payout_method?: string
          reconciliation_status?: string
          rent_request_id?: string
          tenant_id?: string
          transaction_reference?: string | null
        }
        Relationships: []
      }
      disciplinary_records: {
        Row: {
          action_type: Database["public"]["Enums"]["disciplinary_action_type"]
          created_at: string
          description: string
          effective_date: string
          employee_id: string
          expiry_date: string | null
          id: string
          issued_by: string
          resolution_note: string | null
          severity: string
          status: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["disciplinary_action_type"]
          created_at?: string
          description: string
          effective_date?: string
          employee_id: string
          expiry_date?: string | null
          id?: string
          issued_by: string
          resolution_note?: string | null
          severity?: string
          status?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["disciplinary_action_type"]
          created_at?: string
          description?: string
          effective_date?: string
          employee_id?: string
          expiry_date?: string | null
          id?: string
          issued_by?: string
          resolution_note?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disciplinary_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disciplinary_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disciplinary_records_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disciplinary_records_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_records_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disciplinary_records_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_agreement_acceptance: {
        Row: {
          accepted_at: string
          agreement_version: string
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          status: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      fee_revenue_ledger: {
        Row: {
          created_at: string
          deferred_amount: number
          fee_type: string
          id: string
          notes: string | null
          recognition_date: string | null
          recognized_amount: number
          rent_request_id: string | null
          status: string
          tenant_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deferred_amount?: number
          fee_type: string
          id?: string
          notes?: string | null
          recognition_date?: string | null
          recognized_amount?: number
          rent_request_id?: string | null
          status?: string
          tenant_id?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deferred_amount?: number
          fee_type?: string
          id?: string
          notes?: string | null
          recognition_date?: string | null
          recognized_amount?: number
          rent_request_id?: string | null
          status?: string
          tenant_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_revenue_ledger_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_revenue_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fee_revenue_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_revenue_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fee_revenue_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      financial_agents: {
        Row: {
          agent_id: string
          assigned_by: string
          created_at: string
          expense_category: Database["public"]["Enums"]["expense_category"]
          id: string
          is_active: boolean
          label: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          assigned_by: string
          created_at?: string
          expense_category?: Database["public"]["Enums"]["expense_category"]
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assigned_by?: string
          created_at?: string
          expense_category?: Database["public"]["Enums"]["expense_category"]
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_agents_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      funder_visits: {
        Row: {
          accuracy: number | null
          agent_id: string | null
          created_at: string
          funder_id: string | null
          id: string
          latitude: number
          location_name: string | null
          longitude: number
          notes: string | null
          visit_type: string
        }
        Insert: {
          accuracy?: number | null
          agent_id?: string | null
          created_at?: string
          funder_id?: string | null
          id?: string
          latitude: number
          location_name?: string | null
          longitude: number
          notes?: string | null
          visit_type?: string
        }
        Update: {
          accuracy?: number | null
          agent_id?: string | null
          created_at?: string
          funder_id?: string | null
          id?: string
          latitude?: number
          location_name?: string | null
          longitude?: number
          notes?: string | null
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "funder_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funder_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funder_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funder_visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funder_visits_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funder_visits_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funder_visits_funder_id_fkey"
            columns: ["funder_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funder_visits_funder_id_fkey"
            columns: ["funder_id"]
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
          classification: string | null
          created_at: string
          currency: string
          description: string | null
          direction: string
          id: string
          idempotency_key: string | null
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
          classification?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction: string
          id?: string
          idempotency_key?: string | null
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
          classification?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          id?: string
          idempotency_key?: string | null
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
      house_listings: {
        Row: {
          access_fee: number
          address: string
          agent_id: string
          amenities: string[] | null
          caretaker_name: string | null
          caretaker_phone: string | null
          caretaker_user_id: string | null
          created_at: string
          daily_rate: number
          description: string | null
          district: string | null
          geo_point: unknown
          has_electricity: boolean | null
          has_parking: boolean | null
          has_security: boolean | null
          has_water: boolean | null
          house_category: string
          id: string
          image_urls: string[] | null
          is_agent_caretaker: boolean | null
          is_furnished: boolean | null
          landlord_accepted: boolean | null
          landlord_has_smartphone: boolean | null
          landlord_id: string | null
          latitude: number | null
          lc1_chairperson_name: string | null
          lc1_chairperson_phone: string | null
          lc1_chairperson_village: string | null
          listing_bonus_paid: boolean | null
          listing_bonus_paid_at: string | null
          longitude: number | null
          monthly_rent: number
          number_of_rooms: number
          platform_fee: number
          region: string
          short_code: string | null
          status: string
          sub_county: string | null
          tenant_id: string | null
          title: string
          total_monthly_cost: number
          updated_at: string
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
          video_url: string | null
          village: string | null
        }
        Insert: {
          access_fee?: number
          address: string
          agent_id: string
          amenities?: string[] | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          caretaker_user_id?: string | null
          created_at?: string
          daily_rate?: number
          description?: string | null
          district?: string | null
          geo_point?: unknown
          has_electricity?: boolean | null
          has_parking?: boolean | null
          has_security?: boolean | null
          has_water?: boolean | null
          house_category?: string
          id?: string
          image_urls?: string[] | null
          is_agent_caretaker?: boolean | null
          is_furnished?: boolean | null
          landlord_accepted?: boolean | null
          landlord_has_smartphone?: boolean | null
          landlord_id?: string | null
          latitude?: number | null
          lc1_chairperson_name?: string | null
          lc1_chairperson_phone?: string | null
          lc1_chairperson_village?: string | null
          listing_bonus_paid?: boolean | null
          listing_bonus_paid_at?: string | null
          longitude?: number | null
          monthly_rent: number
          number_of_rooms?: number
          platform_fee?: number
          region: string
          short_code?: string | null
          status?: string
          sub_county?: string | null
          tenant_id?: string | null
          title: string
          total_monthly_cost?: number
          updated_at?: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
          village?: string | null
        }
        Update: {
          access_fee?: number
          address?: string
          agent_id?: string
          amenities?: string[] | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          caretaker_user_id?: string | null
          created_at?: string
          daily_rate?: number
          description?: string | null
          district?: string | null
          geo_point?: unknown
          has_electricity?: boolean | null
          has_parking?: boolean | null
          has_security?: boolean | null
          has_water?: boolean | null
          house_category?: string
          id?: string
          image_urls?: string[] | null
          is_agent_caretaker?: boolean | null
          is_furnished?: boolean | null
          landlord_accepted?: boolean | null
          landlord_has_smartphone?: boolean | null
          landlord_id?: string | null
          latitude?: number | null
          lc1_chairperson_name?: string | null
          lc1_chairperson_phone?: string | null
          lc1_chairperson_village?: string | null
          listing_bonus_paid?: boolean | null
          listing_bonus_paid_at?: string | null
          longitude?: number | null
          monthly_rent?: number
          number_of_rooms?: number
          platform_fee?: number
          region?: string
          short_code?: string | null
          status?: string
          sub_county?: string | null
          tenant_id?: string | null
          title?: string
          total_monthly_cost?: number
          updated_at?: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_listings_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
        ]
      }
      house_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          answered_by: string | null
          asker_id: string
          created_at: string
          house_id: string
          id: string
          question_text: string
          updated_at: string
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asker_id: string
          created_at?: string
          house_id: string
          id?: string
          question_text: string
          updated_at?: string
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asker_id?: string
          created_at?: string
          house_id?: string
          id?: string
          question_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_questions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "house_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      house_reviews: {
        Row: {
          accuracy: number | null
          created_at: string
          house_id: string
          id: string
          latitude: number
          longitude: number
          rating: number
          review_text: string | null
          reviewer_id: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          house_id: string
          id?: string
          latitude: number
          longitude: number
          rating: number
          review_text?: string | null
          reviewer_id: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          house_id?: string
          id?: string
          latitude?: number
          longitude?: number
          rating?: number
          review_text?: string | null
          reviewer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_reviews_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "house_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_withdrawal_requests: {
        Row: {
          amount: number
          cfo_processed_at: string | null
          cfo_processed_by: string | null
          coo_approved_at: string | null
          coo_approved_by: string | null
          created_at: string
          earliest_process_date: string
          id: string
          partner_ops_approved_at: string | null
          partner_ops_approved_by: string | null
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
          cfo_processed_at?: string | null
          cfo_processed_by?: string | null
          coo_approved_at?: string | null
          coo_approved_by?: string | null
          created_at?: string
          earliest_process_date?: string
          id?: string
          partner_ops_approved_at?: string | null
          partner_ops_approved_by?: string | null
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
          cfo_processed_at?: string | null
          cfo_processed_by?: string | null
          coo_approved_at?: string | null
          coo_approved_by?: string | null
          created_at?: string
          earliest_process_date?: string
          id?: string
          partner_ops_approved_at?: string | null
          partner_ops_approved_by?: string | null
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
          auto_reinvest: boolean
          bank_account_name: string | null
          bank_name: string | null
          cfo_rejection_reason: string | null
          cfo_verified: boolean | null
          cfo_verified_at: string | null
          cfo_verified_by: string | null
          created_at: string
          display_currency: string
          duration_months: number
          id: string
          investment_amount: number
          investment_reference: string | null
          investor_id: string | null
          invite_id: string | null
          maturity_alert_30d: boolean
          maturity_alert_7d: boolean
          maturity_date: string | null
          mobile_money_number: string | null
          mobile_network: string | null
          next_roi_date: string | null
          payment_method: string | null
          payout_day: number | null
          portfolio_code: string
          portfolio_pin: string
          receipt_file_url: string | null
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
          auto_reinvest?: boolean
          bank_account_name?: string | null
          bank_name?: string | null
          cfo_rejection_reason?: string | null
          cfo_verified?: boolean | null
          cfo_verified_at?: string | null
          cfo_verified_by?: string | null
          created_at?: string
          display_currency?: string
          duration_months: number
          id?: string
          investment_amount: number
          investment_reference?: string | null
          investor_id?: string | null
          invite_id?: string | null
          maturity_alert_30d?: boolean
          maturity_alert_7d?: boolean
          maturity_date?: string | null
          mobile_money_number?: string | null
          mobile_network?: string | null
          next_roi_date?: string | null
          payment_method?: string | null
          payout_day?: number | null
          portfolio_code: string
          portfolio_pin: string
          receipt_file_url?: string | null
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
          auto_reinvest?: boolean
          bank_account_name?: string | null
          bank_name?: string | null
          cfo_rejection_reason?: string | null
          cfo_verified?: boolean | null
          cfo_verified_at?: string | null
          cfo_verified_by?: string | null
          created_at?: string
          display_currency?: string
          duration_months?: number
          id?: string
          investment_amount?: number
          investment_reference?: string | null
          investor_id?: string | null
          invite_id?: string | null
          maturity_alert_30d?: boolean
          maturity_alert_7d?: boolean
          maturity_date?: string | null
          mobile_money_number?: string | null
          mobile_network?: string | null
          next_roi_date?: string | null
          payment_method?: string | null
          payout_day?: number | null
          portfolio_code?: string
          portfolio_pin?: string
          receipt_file_url?: string | null
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
          is_occupied: boolean
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
          is_occupied?: boolean
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
          is_occupied?: boolean
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
      leave_balances: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          remaining_days: number
          total_days: number
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          remaining_days?: number
          total_days?: number
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          remaining_days?: number
          total_days?: number
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days_count: number
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          days_count: number
          employee_id: string
          end_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          days_count?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      listing_bonus_approvals: {
        Row: {
          agent_id: string
          amount: number
          cfo_approved_at: string | null
          cfo_approved_by: string | null
          cfo_notes: string | null
          created_at: string
          id: string
          landlord_ops_approved_at: string | null
          landlord_ops_approved_by: string | null
          landlord_ops_notes: string | null
          ledger_entry_id: string | null
          listing_id: string
          paid_at: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount?: number
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          cfo_notes?: string | null
          created_at?: string
          id?: string
          landlord_ops_approved_at?: string | null
          landlord_ops_approved_by?: string | null
          landlord_ops_notes?: string | null
          ledger_entry_id?: string | null
          listing_id: string
          paid_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          cfo_notes?: string | null
          created_at?: string
          id?: string
          landlord_ops_approved_at?: string | null
          landlord_ops_approved_by?: string | null
          landlord_ops_notes?: string | null
          ledger_entry_id?: string | null
          listing_id?: string
          paid_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      partner_escalations: {
        Row: {
          created_at: string
          details: Json | null
          escalation_type: string
          id: string
          portfolio_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          escalation_type: string
          id?: string
          portfolio_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          escalation_type?: string
          id?: string
          portfolio_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_escalations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "investor_portfolios"
            referencedColumns: ["id"]
          },
        ]
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
      payout_codes: {
        Row: {
          amount: number
          claimed_at: string | null
          claimed_by: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          qr_data: string
          status: string
          user_id: string | null
          withdrawal_request_id: string
        }
        Insert: {
          amount: number
          claimed_at?: string | null
          claimed_by?: string | null
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          qr_data: string
          status?: string
          user_id?: string | null
          withdrawal_request_id: string
        }
        Update: {
          amount?: number
          claimed_at?: string | null
          claimed_by?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          qr_data?: string
          status?: string
          user_id?: string | null
          withdrawal_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_codes_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_codes_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_codes_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_codes_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          batch_month: string
          created_at: string
          created_by: string
          employee_count: number | null
          id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          prepared_by: string | null
          processed_at: string | null
          processed_count: number
          status: string
          submitted_at: string | null
          total_amount: number
          total_employees: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          batch_month: string
          created_at?: string
          created_by: string
          employee_count?: number | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          prepared_by?: string | null
          processed_at?: string | null
          processed_count?: number
          status?: string
          submitted_at?: string | null
          total_amount?: number
          total_employees?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          batch_month?: string
          created_at?: string
          created_by?: string
          employee_count?: number | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          prepared_by?: string | null
          processed_at?: string | null
          processed_count?: number
          status?: string
          submitted_at?: string | null
          total_amount?: number
          total_employees?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_batches_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_batches_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          amount: number
          batch_id: string
          bonuses: Json
          category: string
          created_at: string
          deductions: Json
          description: string | null
          employee_id: string
          id: string
          ledger_reference_id: string | null
          paid_at: string | null
          status: string
        }
        Insert: {
          amount: number
          batch_id: string
          bonuses?: Json
          category?: string
          created_at?: string
          deductions?: Json
          description?: string | null
          employee_id: string
          id?: string
          ledger_reference_id?: string | null
          paid_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          bonuses?: Json
          category?: string
          created_at?: string
          deductions?: Json
          description?: string | null
          employee_id?: string
          id?: string
          ledger_reference_id?: string | null
          paid_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payroll_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
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
          operation_type: string
          payment_method: string | null
          payment_reference: string | null
          reference_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_table: string
          status: string
          target_wallet_user_id: string | null
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
          operation_type?: string
          payment_method?: string | null
          payment_reference?: string | null
          reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_table: string
          status?: string
          target_wallet_user_id?: string | null
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
          operation_type?: string
          payment_method?: string | null
          payment_reference?: string | null
          reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_table?: string
          status?: string
          target_wallet_user_id?: string | null
          transaction_group_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_wallet_operations_target_wallet_user_id_fkey"
            columns: ["target_wallet_user_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pending_wallet_operations_target_wallet_user_id_fkey"
            columns: ["target_wallet_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_wallet_operations_target_wallet_user_id_fkey"
            columns: ["target_wallet_user_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pending_wallet_operations_target_wallet_user_id_fkey"
            columns: ["target_wallet_user_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      platform_expense_transfers: {
        Row: {
          agent_id: string
          amount: number
          approved_by: string
          created_at: string
          description: string
          expense_category: Database["public"]["Enums"]["expense_category"]
          financial_agent_id: string
          id: string
          ledger_reference_id: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          approved_by: string
          created_at?: string
          description: string
          expense_category: Database["public"]["Enums"]["expense_category"]
          financial_agent_id: string
          id?: string
          ledger_reference_id?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          approved_by?: string
          created_at?: string
          description?: string
          expense_category?: Database["public"]["Enums"]["expense_category"]
          financial_agent_id?: string
          id?: string
          ledger_reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_expense_transfers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_expense_transfers_financial_agent_id_fkey"
            columns: ["financial_agent_id"]
            isOneToOne: false
            referencedRelation: "financial_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_renewals: {
        Row: {
          created_at: string
          id: string
          new_created_at: string
          new_duration_months: number
          new_maturity_date: string | null
          new_roi_percentage: number
          old_created_at: string
          old_duration_months: number
          old_maturity_date: string | null
          old_roi_percentage: number
          portfolio_id: string
          reason: string
          renewed_by: string
          top_up_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          new_created_at: string
          new_duration_months: number
          new_maturity_date?: string | null
          new_roi_percentage: number
          old_created_at: string
          old_duration_months: number
          old_maturity_date?: string | null
          old_roi_percentage: number
          portfolio_id: string
          reason: string
          renewed_by: string
          top_up_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          new_created_at?: string
          new_duration_months?: number
          new_maturity_date?: string | null
          new_roi_percentage?: number
          old_created_at?: string
          old_duration_months?: number
          old_maturity_date?: string | null
          old_roi_percentage?: number
          portfolio_id?: string
          reason?: string
          renewed_by?: string
          top_up_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_renewals_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "investor_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_registered_tids: {
        Row: {
          amount: number
          created_at: string
          id: string
          matched_at: string | null
          matched_deposit_id: string | null
          notes: string | null
          provider: string | null
          registered_by: string
          status: string
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          matched_at?: string | null
          matched_deposit_id?: string | null
          notes?: string | null
          provider?: string | null
          registered_by: string
          status?: string
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          matched_at?: string | null
          matched_deposit_id?: string | null
          notes?: string | null
          provider?: string | null
          registered_by?: string
          status?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_registered_tids_matched_deposit_id_fkey"
            columns: ["matched_deposit_id"]
            isOneToOne: false
            referencedRelation: "deposit_requests"
            referencedColumns: ["id"]
          },
        ]
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
          is_seller: boolean
          last_active_at: string | null
          mobile_money_number: string | null
          mobile_money_provider: string | null
          monthly_rent: number | null
          must_change_password: boolean | null
          national_id: string | null
          phone: string
          referrer_id: string | null
          rent_discount_active: boolean
          seller_application_status: string | null
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
          is_seller?: boolean
          last_active_at?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          must_change_password?: boolean | null
          national_id?: string | null
          phone: string
          referrer_id?: string | null
          rent_discount_active?: boolean
          seller_application_status?: string | null
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
          is_seller?: boolean
          last_active_at?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          must_change_password?: boolean | null
          national_id?: string | null
          phone?: string
          referrer_id?: string | null
          rent_discount_active?: boolean
          seller_application_status?: string | null
          territory?: string | null
          updated_at?: string
          verified?: boolean
          whatsapp_verified?: boolean | null
          whatsapp_verified_at?: string | null
        }
        Relationships: []
      }
      promissory_notes: {
        Row: {
          activation_token: string
          agent_id: string
          amount: number
          contribution_type: string
          created_at: string
          deduction_day: number | null
          email: string | null
          id: string
          next_deduction_date: string | null
          notes: string | null
          partner_name: string
          partner_user_id: string | null
          phone_number: string | null
          status: string
          total_collected: number
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          activation_token?: string
          agent_id: string
          amount: number
          contribution_type?: string
          created_at?: string
          deduction_day?: number | null
          email?: string | null
          id?: string
          next_deduction_date?: string | null
          notes?: string | null
          partner_name: string
          partner_user_id?: string | null
          phone_number?: string | null
          status?: string
          total_collected?: number
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          activation_token?: string
          agent_id?: string
          amount?: number
          contribution_type?: string
          created_at?: string
          deduction_day?: number | null
          email?: string | null
          id?: string
          next_deduction_date?: string | null
          notes?: string | null
          partner_name?: string
          partner_user_id?: string | null
          phone_number?: string | null
          status?: string
          total_collected?: number
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      property_viewings: {
        Row: {
          agent_checkin_at: string | null
          agent_checkin_lat: number | null
          agent_checkin_lng: number | null
          agent_confirmed: boolean | null
          agent_confirmed_at: string | null
          agent_feedback: string | null
          agent_id: string
          agent_rated_at: string | null
          agent_rating: number | null
          assigned_by: string | null
          confirmation_count: number | null
          confirmation_sms_sent: boolean | null
          created_at: string | null
          house_listing_id: string
          id: string
          landlord_confirmed: boolean | null
          landlord_confirmed_at: string | null
          landlord_id: string | null
          meeting_verified: boolean | null
          notes: string | null
          pin_verified: boolean | null
          pin_verified_at: string | null
          proximity_distance_m: number | null
          proximity_verified: boolean | null
          scheduled_date: string | null
          scheduled_time: string | null
          sms_sent: boolean | null
          status: string
          tenant_checkin_at: string | null
          tenant_checkin_lat: number | null
          tenant_checkin_lng: number | null
          tenant_confirmed: boolean | null
          tenant_confirmed_at: string | null
          tenant_feedback: string | null
          tenant_id: string
          tenant_rated_at: string | null
          tenant_rating: number | null
          updated_at: string | null
          viewing_pin: string | null
        }
        Insert: {
          agent_checkin_at?: string | null
          agent_checkin_lat?: number | null
          agent_checkin_lng?: number | null
          agent_confirmed?: boolean | null
          agent_confirmed_at?: string | null
          agent_feedback?: string | null
          agent_id: string
          agent_rated_at?: string | null
          agent_rating?: number | null
          assigned_by?: string | null
          confirmation_count?: number | null
          confirmation_sms_sent?: boolean | null
          created_at?: string | null
          house_listing_id: string
          id?: string
          landlord_confirmed?: boolean | null
          landlord_confirmed_at?: string | null
          landlord_id?: string | null
          meeting_verified?: boolean | null
          notes?: string | null
          pin_verified?: boolean | null
          pin_verified_at?: string | null
          proximity_distance_m?: number | null
          proximity_verified?: boolean | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          sms_sent?: boolean | null
          status?: string
          tenant_checkin_at?: string | null
          tenant_checkin_lat?: number | null
          tenant_checkin_lng?: number | null
          tenant_confirmed?: boolean | null
          tenant_confirmed_at?: string | null
          tenant_feedback?: string | null
          tenant_id: string
          tenant_rated_at?: string | null
          tenant_rating?: number | null
          updated_at?: string | null
          viewing_pin?: string | null
        }
        Update: {
          agent_checkin_at?: string | null
          agent_checkin_lat?: number | null
          agent_checkin_lng?: number | null
          agent_confirmed?: boolean | null
          agent_confirmed_at?: string | null
          agent_feedback?: string | null
          agent_id?: string
          agent_rated_at?: string | null
          agent_rating?: number | null
          assigned_by?: string | null
          confirmation_count?: number | null
          confirmation_sms_sent?: boolean | null
          created_at?: string | null
          house_listing_id?: string
          id?: string
          landlord_confirmed?: boolean | null
          landlord_confirmed_at?: string | null
          landlord_id?: string | null
          meeting_verified?: boolean | null
          notes?: string | null
          pin_verified?: boolean | null
          pin_verified_at?: string | null
          proximity_distance_m?: number | null
          proximity_verified?: boolean | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          sms_sent?: boolean | null
          status?: string
          tenant_checkin_at?: string | null
          tenant_checkin_lat?: number | null
          tenant_checkin_lng?: number | null
          tenant_confirmed?: boolean | null
          tenant_confirmed_at?: string | null
          tenant_feedback?: string | null
          tenant_id?: string
          tenant_rated_at?: string | null
          tenant_rating?: number | null
          updated_at?: string | null
          viewing_pin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_viewings_house_listing_id_fkey"
            columns: ["house_listing_id"]
            isOneToOne: false
            referencedRelation: "house_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_viewings_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
        ]
      }
      proxy_agent_assignments: {
        Row: {
          agent_id: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          assigned_by: string
          beneficiary_id: string
          beneficiary_role: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          is_managed_account: boolean
          reason: string | null
          rejection_reason: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_by: string
          beneficiary_id: string
          beneficiary_role: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_managed_account?: boolean
          reason?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_by?: string
          beneficiary_id?: string
          beneficiary_role?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_managed_account?: boolean
          reason?: string | null
          rejection_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proxy_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "proxy_agent_assignments_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      rent_request_deletions: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_phone: string | null
          amount_repaid: number
          created_at: string
          daily_repayment: number
          deleted_by: string
          deleted_by_name: string | null
          deletion_reason: string | null
          disbursed_at: string | null
          expires_at: string
          id: string
          outstanding: number
          rent_amount: number
          rent_request_id: string
          request_status: string | null
          snapshot_json: Json | null
          tenant_id: string
          tenant_name: string
          tenant_phone: string | null
          tenant_wallet: number
          total_repayment: number
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          amount_repaid?: number
          created_at?: string
          daily_repayment?: number
          deleted_by: string
          deleted_by_name?: string | null
          deletion_reason?: string | null
          disbursed_at?: string | null
          expires_at?: string
          id?: string
          outstanding?: number
          rent_amount?: number
          rent_request_id: string
          request_status?: string | null
          snapshot_json?: Json | null
          tenant_id: string
          tenant_name: string
          tenant_phone?: string | null
          tenant_wallet?: number
          total_repayment?: number
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          amount_repaid?: number
          created_at?: string
          daily_repayment?: number
          deleted_by?: string
          deleted_by_name?: string | null
          deletion_reason?: string | null
          disbursed_at?: string | null
          expires_at?: string
          id?: string
          outstanding?: number
          rent_amount?: number
          rent_request_id?: string
          request_status?: string | null
          snapshot_json?: Json | null
          tenant_id?: string
          tenant_name?: string
          tenant_phone?: string | null
          tenant_wallet?: number
          total_repayment?: number
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
          assigned_agent_id: string | null
          cfo_reviewed_at: string | null
          cfo_reviewed_by: string | null
          coo_reviewed_at: string | null
          coo_reviewed_by: string | null
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
          house_image_urls: string[] | null
          id: string
          initial_outstanding_balance: number | null
          landlord_id: string
          landlord_ops_reviewed_at: string | null
          landlord_ops_reviewed_by: string | null
          lc1_id: string
          manager_verified: boolean | null
          manager_verified_at: string | null
          manager_verified_by: string | null
          next_roi_due_date: string | null
          number_of_payments: number | null
          payout_method: string | null
          payout_transaction_reference: string | null
          registration_type: string
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
          tenant_ops_reviewed_at: string | null
          tenant_ops_reviewed_by: string | null
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
          assigned_agent_id?: string | null
          cfo_reviewed_at?: string | null
          cfo_reviewed_by?: string | null
          coo_reviewed_at?: string | null
          coo_reviewed_by?: string | null
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
          house_image_urls?: string[] | null
          id?: string
          initial_outstanding_balance?: number | null
          landlord_id: string
          landlord_ops_reviewed_at?: string | null
          landlord_ops_reviewed_by?: string | null
          lc1_id: string
          manager_verified?: boolean | null
          manager_verified_at?: string | null
          manager_verified_by?: string | null
          next_roi_due_date?: string | null
          number_of_payments?: number | null
          payout_method?: string | null
          payout_transaction_reference?: string | null
          registration_type?: string
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
          tenant_ops_reviewed_at?: string | null
          tenant_ops_reviewed_by?: string | null
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
          assigned_agent_id?: string | null
          cfo_reviewed_at?: string | null
          cfo_reviewed_by?: string | null
          coo_reviewed_at?: string | null
          coo_reviewed_by?: string | null
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
          house_image_urls?: string[] | null
          id?: string
          initial_outstanding_balance?: number | null
          landlord_id?: string
          landlord_ops_reviewed_at?: string | null
          landlord_ops_reviewed_by?: string | null
          lc1_id?: string
          manager_verified?: boolean | null
          manager_verified_at?: string | null
          manager_verified_by?: string | null
          next_roi_due_date?: string | null
          number_of_payments?: number | null
          payout_method?: string | null
          payout_transaction_reference?: string | null
          registration_type?: string
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
          tenant_ops_reviewed_at?: string | null
          tenant_ops_reviewed_by?: string | null
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
      role_access_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          rejection_reason: string | null
          requested_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_role: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "role_access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "role_access_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      saved_houses: {
        Row: {
          created_at: string
          house_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_houses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "house_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_payouts: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          day_of_month: number
          enabled: boolean
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string | null
          reason: string
          sub_category: string | null
          target_user_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by: string
          day_of_month: number
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          reason: string
          sub_category?: string | null
          target_user_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          day_of_month?: number
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          reason?: string
          sub_category?: string | null
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_centre_setups: {
        Row: {
          agent_id: string
          agent_name: string
          agent_phone: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          latitude: number
          location_name: string | null
          longitude: number
          photo_url: string
          rejection_reason: string | null
          status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          agent_id: string
          agent_name: string
          agent_phone: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          latitude: number
          location_name?: string | null
          longitude: number
          photo_url: string
          rejection_reason?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          agent_id?: string
          agent_name?: string
          agent_phone?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          latitude?: number
          location_name?: string | null
          longitude?: number
          photo_url?: string
          rejection_reason?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      settlement_reconciliation_ledger: {
        Row: {
          channel: string
          created_at: string
          discrepancy_amount: number
          external_amount: number
          external_reference: string | null
          id: string
          notes: string | null
          period_date: string
          reconciled_at: string | null
          reconciled_by: string | null
          status: string
          system_amount: number
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          discrepancy_amount?: number
          external_amount?: number
          external_reference?: string | null
          id?: string
          notes?: string | null
          period_date: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: string
          system_amount?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          discrepancy_amount?: number
          external_amount?: number
          external_reference?: string | null
          id?: string
          notes?: string | null
          period_date?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: string
          system_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_reconciliation_ledger_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_reconciliation_ledger_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_reconciliation_ledger_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "settlement_reconciliation_ledger_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shadow_audit_logs: {
        Row: {
          created_at: string
          function_name: string
          id: string
          is_match: boolean
          primary_passed: boolean
          shadow_errors: Json | null
          shadow_passed: boolean
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          is_match?: boolean
          primary_passed: boolean
          shadow_errors?: Json | null
          shadow_passed: boolean
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          is_match?: boolean
          primary_passed?: boolean
          shadow_errors?: Json | null
          shadow_passed?: boolean
        }
        Relationships: []
      }
      shadow_config: {
        Row: {
          enabled: boolean
          id: string
          sample_percentage: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          sample_percentage?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          sample_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          code: string
          created_at: string
          id: string
          target_params: Json
          target_path: string
          user_id: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          target_params?: Json
          target_path: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          target_params?: Json
          target_path?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_access_passwords: {
        Row: {
          created_at: string | null
          id: string
          must_change: boolean | null
          password_hash: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          must_change?: boolean | null
          password_hash: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          must_change?: boolean | null
          password_hash?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          permitted_dashboard: string
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permitted_dashboard: string
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permitted_dashboard?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          agreement_accepted: boolean
          created_at: string | null
          created_by: string | null
          department: string
          employee_id: string
          id: string
          job_title: string | null
          must_change_password: boolean | null
          position: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agreement_accepted?: boolean
          created_at?: string | null
          created_by?: string | null
          department?: string
          employee_id: string
          id?: string
          job_title?: string | null
          must_change_password?: boolean | null
          position?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agreement_accepted?: boolean
          created_at?: string | null
          created_by?: string | null
          department?: string
          employee_id?: string
          id?: string
          job_title?: string | null
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
          consecutive_failures: number
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
          consecutive_failures?: number
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
          consecutive_failures?: number
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
      supporter_capital_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          rent_request_id: string | null
          supporter_id: string
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          rent_request_id?: string | null
          supporter_id: string
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          rent_request_id?: string | null
          supporter_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_capital_ledger_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_capital_ledger_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supporter_capital_ledger_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_capital_ledger_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supporter_capital_ledger_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      suspense_ledger: {
        Row: {
          amount: number
          created_at: string
          depositor_name: string | null
          depositor_phone: string | null
          id: string
          matched_at: string | null
          matched_by: string | null
          matched_to_user_id: string | null
          notes: string | null
          reference_id: string | null
          refunded_at: string | null
          source_channel: string
          status: string
          updated_at: string
          written_off_at: string | null
          written_off_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          depositor_name?: string | null
          depositor_phone?: string | null
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_to_user_id?: string | null
          notes?: string | null
          reference_id?: string | null
          refunded_at?: string | null
          source_channel?: string
          status?: string
          updated_at?: string
          written_off_at?: string | null
          written_off_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          depositor_name?: string | null
          depositor_phone?: string | null
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_to_user_id?: string | null
          notes?: string | null
          reference_id?: string | null
          refunded_at?: string | null
          source_channel?: string
          status?: string
          updated_at?: string
          written_off_at?: string | null
          written_off_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suspense_ledger_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_to_user_id_fkey"
            columns: ["matched_to_user_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_to_user_id_fkey"
            columns: ["matched_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_to_user_id_fkey"
            columns: ["matched_to_user_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_matched_to_user_id_fkey"
            columns: ["matched_to_user_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_written_off_by_fkey"
            columns: ["written_off_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_written_off_by_fkey"
            columns: ["written_off_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspense_ledger_written_off_by_fkey"
            columns: ["written_off_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "suspense_ledger_written_off_by_fkey"
            columns: ["written_off_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
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
      tenant_transfers: {
        Row: {
          created_at: string
          flag_type: string | null
          from_agent_id: string | null
          id: string
          reason: string
          rent_requests_updated: number | null
          subscriptions_updated: number | null
          tenant_id: string | null
          to_agent_id: string | null
          transferred_by: string | null
        }
        Insert: {
          created_at?: string
          flag_type?: string | null
          from_agent_id?: string | null
          id?: string
          reason: string
          rent_requests_updated?: number | null
          subscriptions_updated?: number | null
          tenant_id?: string | null
          to_agent_id?: string | null
          transferred_by?: string | null
        }
        Update: {
          created_at?: string
          flag_type?: string | null
          from_agent_id?: string | null
          id?: string
          reason?: string
          rent_requests_updated?: number | null
          subscriptions_updated?: number | null
          tenant_id?: string | null
          to_agent_id?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_transfers_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_transfers_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_transfers_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_transfers_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenant_transfers_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
      treasury_controls: {
        Row: {
          control_key: string
          enabled: boolean
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          control_key: string
          enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          control_key?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      wallet_deductions: {
        Row: {
          amount: number
          category: string
          created_at: string
          deducted_by: string
          id: string
          ledger_entry_id: string | null
          reason: string
          target_user_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          deducted_by: string
          id?: string
          ledger_entry_id?: string | null
          reason: string
          target_user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deducted_by?: string
          id?: string
          ledger_entry_id?: string | null
          reason?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_deductions_deducted_by_fkey"
            columns: ["deducted_by"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_deductions_deducted_by_fkey"
            columns: ["deducted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_deductions_deducted_by_fkey"
            columns: ["deducted_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_deductions_deducted_by_fkey"
            columns: ["deducted_by"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_deductions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "manager_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_deductions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_deductions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_deductions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_financial_summaries"
            referencedColumns: ["user_id"]
          },
        ]
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
          currency: string
          id: string
          locked_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
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
          agent_id: string | null
          agent_location: string | null
          amount: number
          assigned_cashout_agent_id: string | null
          auto_dispatched: boolean | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          cfo_approved_at: string | null
          cfo_approved_by: string | null
          coo_approved_at: string | null
          coo_approved_by: string | null
          created_at: string
          dispatched_at: string | null
          fin_ops_approved_at: string | null
          fin_ops_approved_by: string | null
          fin_ops_payment_method: string | null
          fin_ops_reference: string | null
          fin_ops_verified_at: string | null
          fin_ops_verified_by: string | null
          id: string
          linked_party: string | null
          manager_approved_at: string | null
          manager_approved_by: string | null
          mobile_money_name: string | null
          mobile_money_number: string | null
          mobile_money_provider: string | null
          payout_code: string | null
          payout_method: string
          payout_proof: string | null
          payout_proof_type: string | null
          priority_level: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          rejection_reason: string | null
          status: string
          transaction_id: string | null
          transaction_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_location?: string | null
          amount: number
          assigned_cashout_agent_id?: string | null
          auto_dispatched?: boolean | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          coo_approved_at?: string | null
          coo_approved_by?: string | null
          created_at?: string
          dispatched_at?: string | null
          fin_ops_approved_at?: string | null
          fin_ops_approved_by?: string | null
          fin_ops_payment_method?: string | null
          fin_ops_reference?: string | null
          fin_ops_verified_at?: string | null
          fin_ops_verified_by?: string | null
          id?: string
          linked_party?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          payout_code?: string | null
          payout_method?: string
          payout_proof?: string | null
          payout_proof_type?: string | null
          priority_level?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_id?: string | null
          transaction_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          agent_location?: string | null
          amount?: number
          assigned_cashout_agent_id?: string | null
          auto_dispatched?: boolean | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cfo_approved_at?: string | null
          cfo_approved_by?: string | null
          coo_approved_at?: string | null
          coo_approved_by?: string | null
          created_at?: string
          dispatched_at?: string | null
          fin_ops_approved_at?: string | null
          fin_ops_approved_by?: string | null
          fin_ops_payment_method?: string | null
          fin_ops_reference?: string | null
          fin_ops_verified_at?: string | null
          fin_ops_verified_by?: string | null
          id?: string
          linked_party?: string | null
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          payout_code?: string | null
          payout_method?: string
          payout_proof?: string | null
          payout_proof_type?: string | null
          priority_level?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_id?: string | null
          transaction_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_assigned_cashout_agent_id_fkey"
            columns: ["assigned_cashout_agent_id"]
            isOneToOne: false
            referencedRelation: "cashout_agents"
            referencedColumns: ["id"]
          },
        ]
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
      auto_dispatch_withdrawals: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      check_phone_exists: {
        Args: { phone_suffix: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_system_events: { Args: never; Returns: undefined }
      compute_daily_stats: { Args: never; Returns: undefined }
      create_direct_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      create_ledger_transaction: {
        Args: {
          entries: Json
          idempotency_key?: string
          skip_balance_check?: boolean
        }
        Returns: string
      }
      credit_agent_event_bonus:
        | {
            Args: {
              p_agent_id: string
              p_event_type: string
              p_source_id?: string
              p_tenant_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_agent_id: string
              p_event_type: string
              p_source_id?: string
              p_tenant_id: string
            }
            Returns: Json
          }
      credit_agent_rent_commission: {
        Args: {
          p_event_reference_id?: string
          p_rent_request_id: string
          p_repayment_amount: number
          p_tenant_id: string
        }
        Returns: Json
      }
      credit_proxy_approval:
        | {
            Args: {
              p_agent_id: string
              p_amount: number
              p_beneficiary_id: string
              p_description: string
              p_portfolio_code: string
              p_source_id: string
              p_transaction_group_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_agent_id: string
              p_amount: number
              p_beneficiary_id: string
              p_source_id: string
              p_transaction_group_id: string
            }
            Returns: undefined
          }
      decrement_rent_requested: {
        Args: { p_amount: number; p_summary_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_velocity_abuse: {
        Args: { p_threshold?: number; p_window_minutes?: number }
        Returns: {
          deposit_count: number
          user_id: string
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_duplicate_phones: {
        Args: never
        Returns: {
          normalized_phone: string
          user_count: number
          user_ids: string[]
        }[]
      }
      find_nearby_houses: {
        Args: {
          category_filter?: string
          radius_km?: number
          region_filter?: string
          result_limit?: number
          user_lat: number
          user_lng: number
        }
        Returns: {
          access_fee: number
          address: string
          created_at: string
          daily_rate: number
          description: string
          distance_km: number
          district: string
          has_electricity: boolean
          has_parking: boolean
          has_security: boolean
          has_water: boolean
          house_category: string
          id: string
          image_urls: string[]
          is_furnished: boolean
          latitude: number
          longitude: number
          monthly_rent: number
          number_of_rooms: number
          platform_fee: number
          region: string
          status: string
          title: string
          total_monthly_cost: number
          verified: boolean
        }[]
      }
      generate_employee_id: { Args: { _full_name: string }; Returns: string }
      generate_portfolio_code: { Args: never; Returns: string }
      generate_short_code: { Args: never; Returns: string }
      generate_welile_ai_id: { Args: { user_uuid: string }; Returns: string }
      get_agent_split_balances: {
        Args: { p_agent_id: string }
        Returns: {
          commission_balance: number
          float_balance: number
        }[]
      }
      get_agent_workload_summary: { Args: never; Returns: Json }
      get_agents_hub:
        | {
            Args: {
              page_limit?: number
              page_offset?: number
              search_query?: string
              sort_dir?: string
              sort_field?: string
            }
            Returns: {
              full_name: string
              id: string
              landlords_count: number
              last_active_at: string
              phone: string
              tenants_count: number
              territory: string
              total_commission: number
              total_count: number
              wallet_balance: number
            }[]
          }
        | {
            Args: {
              active_only?: boolean
              page_limit?: number
              page_offset?: number
              search_query?: string
              sort_dir?: string
              sort_field?: string
            }
            Returns: {
              full_name: string
              id: string
              landlords_count: number
              last_active_at: string
              phone: string
              tenants_count: number
              territory: string
              total_commission: number
              total_count: number
              wallet_balance: number
            }[]
          }
      get_approximate_user_count: { Args: never; Returns: number }
      get_buffer_metrics: { Args: never; Returns: Json }
      get_buffer_trend_data: { Args: never; Returns: Json }
      get_chain_health_summary: {
        Args: never
        Returns: {
          fully_linked: number
          missing_photos: number
          total_properties: number
          unverified: number
          with_agent: number
          with_gps: number
          with_landlord: number
          with_tenant: number
          without_agent: number
          without_gps: number
          without_landlord: number
        }[]
      }
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
      get_financial_ops_pulse: { Args: never; Returns: Json }
      get_flagged_tenants_for_transfer: {
        Args: never
        Returns: {
          accumulated_debt: number
          active_rent_requests: number
          agent_id: string
          agent_name: string
          flag_type: string
          last_visit_at: string
          tenant_id: string
          tenant_name: string
          tenant_phone: string
        }[]
      }
      get_ledger_balance: { Args: { p_user_id: string }; Returns: number }
      get_ledger_integrity_checks: { Args: never; Returns: Json }
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
      get_paginated_transactions: {
        Args: {
          p_category?: string
          p_direction?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          amount: number
          category: string
          description: string
          direction: string
          id: string
          ledger_scope: string
          linked_party: string
          reference_id: string
          source_table: string
          total_count: number
          transaction_date: string
          user_id: string
        }[]
      }
      get_pending_wallet_ops: {
        Args: { p_page?: number; p_page_size?: number }
        Returns: Json
      }
      get_platform_cash_breakdown: { Args: never; Returns: Json }
      get_platform_cash_summary: { Args: never; Returns: Json }
      get_property_clusters: {
        Args: {
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
          status_filter?: string
          zoom_level?: number
        }
        Returns: {
          address: string
          agent_id: string
          cluster_id: string
          daily_rate: number
          empty_count: number
          house_category: string
          image_url: string
          is_cluster: boolean
          landlord_id: string
          lat: number
          lng: number
          monthly_rent: number
          number_of_rooms: number
          occupied_count: number
          paid_count: number
          property_count: number
          property_id: string
          requested_count: number
          status: string
          tenant_id: string
          title: string
        }[]
      }
      get_property_status_counts: {
        Args: never
        Returns: {
          empty_count: number
          occupied_count: number
          total_count: number
          with_gps: number
        }[]
      }
      get_rent_requests_summary: { Args: never; Returns: Json }
      get_shadow_match_rate: {
        Args: { p_hours?: number }
        Returns: {
          divergences: number
          function_name: string
          match_rate_pct: number
          matches: number
          total_samples: number
        }[]
      }
      get_supporter_pool_stats: { Args: never; Returns: Json }
      get_tenant_behavior_segments: {
        Args: never
        Returns: {
          critical_count: number
          first_default_count: number
          healthy_count: number
          overdue_count: number
          recovering_count: number
          total_overdue_amount: number
          total_with_requests: number
          warning_count: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_wallet_ops_stats: { Args: { p_period?: string }; Returns: Json }
      get_wallet_reconciliation: {
        Args: never
        Returns: {
          discrepancy: number
          ledger_balance: number
          user_id: string
          user_name: string
          wallet_balance: number
        }[]
      }
      get_wallet_totals: { Args: never; Returns: Json }
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
      log_system_event:
        | {
            Args: {
              p_event_type: Database["public"]["Enums"]["system_event_type"]
              p_metadata?: Json
              p_related_entity_id?: string
              p_related_entity_type?: string
              p_user_id: string
            }
            Returns: string
          }
        | {
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
      lookup_invite_by_token: {
        Args: { p_token: string }
        Returns: {
          activated_user_id: string
          email: string
          full_name: string
          phone: string
          role: string
          status: string
        }[]
      }
      lookup_profile_by_phone_last9: {
        Args: { phone_last9: string }
        Returns: {
          email: string
          phone: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_phone_last9: { Args: { phone: string }; Returns: string }
      notify_landlord_registration_helper: {
        Args: { p_landlord_id: string }
        Returns: undefined
      }
      process_monthly_referral_rewards: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
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
        Args: {
          p_amount: number
          p_tenant_id: string
          p_transaction_group_id?: string
        }
        Returns: undefined
      }
      refresh_financial_summaries: { Args: never; Returns: undefined }
      reset_agent_float_if_stale: {
        Args: { p_agent_id: string }
        Returns: undefined
      }
      reset_staff_access_password: {
        Args: { p_reset_by: string; p_user_id: string }
        Returns: boolean
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
      search_tenant_behavior: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_segment?: string
        }
        Returns: {
          active_requests: number
          current_overdue_amount: number
          defaulted_count: number
          first_request_date: string
          full_name: string
          fully_repaid_count: number
          health_score: number
          last_payment_date: string
          missed_payments: number
          on_time_payments: number
          phone: string
          repayment_pct: number
          risk_level: string
          tenant_id: string
          total_rent_amount: number
          total_repaid: number
          total_requests: number
        }[]
      }
      search_users_paginated: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_role?: string
          p_search?: string
          p_sort?: string
          p_verified?: string
        }
        Returns: {
          avatar_url: string
          city: string
          country: string
          country_code: string
          created_at: string
          email: string
          full_name: string
          id: string
          monthly_rent: number
          phone: string
          rent_discount_active: boolean
          total_count: number
          verified: boolean
          whatsapp_verified: boolean
        }[]
      }
      search_wallets_by_balance: {
        Args: {
          p_limit?: number
          p_max_balance?: number
          p_min_balance?: number
        }
        Returns: {
          balance: number
          full_name: string
          phone: string
          user_id: string
        }[]
      }
      set_staff_access_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_agent_collection_streak: {
        Args: { p_agent_id: string }
        Returns: undefined
      }
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
      validate_treasury_action: {
        Args: { action_type: string; p_amount: number; p_user_id?: string }
        Returns: boolean
      }
      verify_staff_access_password: {
        Args: { p_password: string; p_user_id: string }
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
        | "hr"
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
      disciplinary_action_type:
        | "verbal_warning"
        | "written_warning"
        | "suspension"
        | "termination"
        | "probation"
      expense_category:
        | "operations"
        | "marketing"
        | "research_and_development"
        | "salaries"
        | "agent_advances"
        | "employee_advances"
        | "general"
      flag_severity: "low" | "medium" | "high" | "critical"
      leave_type: "annual" | "sick" | "personal" | "maternity" | "paternity"
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
        | "deposit_approved"
        | "deposit_rejected"
        | "withdrawal_requested"
        | "withdrawal_approved"
        | "withdrawal_rejected"
        | "wallet_transfer"
        | "portfolio_topup"
        | "rent_disbursed"
        | "roi_distributed"
        | "loan_approved"
        | "loan_rejected"
        | "expense_transfer"
        | "agent_collection"
        | "role_changed"
        | "user_deleted"
        | "password_reset"
        | "login_success"
        | "listing_created"
        | "listing_approved"
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
        "hr",
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
      disciplinary_action_type: [
        "verbal_warning",
        "written_warning",
        "suspension",
        "termination",
        "probation",
      ],
      expense_category: [
        "operations",
        "marketing",
        "research_and_development",
        "salaries",
        "agent_advances",
        "employee_advances",
        "general",
      ],
      flag_severity: ["low", "medium", "high", "critical"],
      leave_type: ["annual", "sick", "personal", "maternity", "paternity"],
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
        "deposit_approved",
        "deposit_rejected",
        "withdrawal_requested",
        "withdrawal_approved",
        "withdrawal_rejected",
        "wallet_transfer",
        "portfolio_topup",
        "rent_disbursed",
        "roi_distributed",
        "loan_approved",
        "loan_rejected",
        "expense_transfer",
        "agent_collection",
        "role_changed",
        "user_deleted",
        "password_reset",
        "login_success",
        "listing_created",
        "listing_approved",
      ],
    },
  },
} as const
