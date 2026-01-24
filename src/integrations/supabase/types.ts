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
      agent_agreement_acceptance: {
        Row: {
          accepted_at: string
          agent_id: string
          agreement_version: string
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          status: string
        }
        Insert: {
          accepted_at?: string
          agent_id: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string
          agent_id?: string
          agreement_version?: string
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          status?: string
        }
        Relationships: []
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
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          performed_by: string
          reason: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by: string
          reason?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string
          reason?: string | null
          record_id?: string
          table_name?: string
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
      financial_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          current_value: number
          id: string
          metric_name: string
          threshold_id: string | null
          threshold_value: number
          triggered_at: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          current_value: number
          id?: string
          metric_name: string
          threshold_id?: string | null
          threshold_value: number
          triggered_at?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          current_value?: number
          id?: string
          metric_name?: string
          threshold_id?: string | null
          threshold_value?: number
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_alerts_threshold_id_fkey"
            columns: ["threshold_id"]
            isOneToOne: false
            referencedRelation: "financial_thresholds"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_thresholds: {
        Row: {
          comparison_type: string
          created_at: string
          enabled: boolean
          id: string
          metric_name: string
          notification_message: string | null
          threshold_value: number
          updated_at: string
        }
        Insert: {
          comparison_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          metric_name: string
          notification_message?: string | null
          threshold_value: number
          updated_at?: string
        }
        Update: {
          comparison_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          metric_name?: string
          notification_message?: string | null
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      force_refresh_signals: {
        Row: {
          expires_at: string
          id: string
          message: string | null
          target_user_id: string | null
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          expires_at?: string
          id?: string
          message?: string | null
          target_user_id?: string | null
          triggered_at?: string
          triggered_by: string
        }
        Update: {
          expires_at?: string
          id?: string
          message?: string | null
          target_user_id?: string | null
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      investment_accounts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          balance: number
          color: string
          created_at: string
          id: string
          name: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          balance?: number
          color?: string
          created_at?: string
          id?: string
          name: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          balance?: number
          color?: string
          created_at?: string
          id?: string
          name?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_interest_payments: {
        Row: {
          account_id: string
          credited_at: string
          id: string
          interest_amount: number
          interest_rate: number
          payment_month: string
          principal_amount: number
          user_id: string
        }
        Insert: {
          account_id: string
          credited_at?: string
          id?: string
          interest_amount: number
          interest_rate?: number
          payment_month: string
          principal_amount: number
          user_id: string
        }
        Update: {
          account_id?: string
          credited_at?: string
          id?: string
          interest_amount?: number
          interest_rate?: number
          payment_month?: string
          principal_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_interest_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_payment_proofs: {
        Row: {
          amount: number
          created_at: string
          id: string
          landlord_id: string
          last_roi_payment_at: string | null
          next_roi_due_date: string | null
          payment_date: string
          payment_method: string
          proof_image_url: string | null
          rejection_reason: string | null
          rent_request_id: string
          reward_credited: boolean | null
          reward_credited_at: string | null
          roi_payments_count: number | null
          status: string | null
          supporter_id: string
          total_roi_paid: number | null
          transaction_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          landlord_id: string
          last_roi_payment_at?: string | null
          next_roi_due_date?: string | null
          payment_date?: string
          payment_method: string
          proof_image_url?: string | null
          rejection_reason?: string | null
          rent_request_id: string
          reward_credited?: boolean | null
          reward_credited_at?: string | null
          roi_payments_count?: number | null
          status?: string | null
          supporter_id: string
          total_roi_paid?: number | null
          transaction_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          landlord_id?: string
          last_roi_payment_at?: string | null
          next_roi_due_date?: string | null
          payment_date?: string
          payment_method?: string
          proof_image_url?: string | null
          rejection_reason?: string | null
          rent_request_id?: string
          reward_credited?: boolean | null
          reward_credited_at?: string | null
          roi_payments_count?: number | null
          status?: string | null
          supporter_id?: string
          total_roi_paid?: number | null
          transaction_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landlord_payment_proofs_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "landlords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payment_proofs_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payment_proofs_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payment_proofs_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "landlord_payment_proofs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landlord_payment_proofs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      landlords: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          id: string
          mobile_money_number: string | null
          monthly_rent: number | null
          name: string
          phone: string
          property_address: string
          ready_to_receive: boolean | null
          registered_by: string | null
          tenant_id: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          mobile_money_number?: string | null
          monthly_rent?: number | null
          name: string
          phone: string
          property_address: string
          ready_to_receive?: boolean | null
          registered_by?: string | null
          tenant_id?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          mobile_money_number?: string | null
          monthly_rent?: number | null
          name?: string
          phone?: string
          property_address?: string
          ready_to_receive?: boolean | null
          registered_by?: string | null
          tenant_id?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
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
        ]
      }
      late_fee_configurations: {
        Row: {
          active: boolean
          apply_daily: boolean
          created_at: string
          grace_period_days: number
          id: string
          max_penalty_percentage: number | null
          name: string
          penalty_type: string
          penalty_value: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          apply_daily?: boolean
          created_at?: string
          grace_period_days?: number
          id?: string
          max_penalty_percentage?: number | null
          name: string
          penalty_type?: string
          penalty_value?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          apply_daily?: boolean
          created_at?: string
          grace_period_days?: number
          id?: string
          max_penalty_percentage?: number | null
          name?: string
          penalty_type?: string
          penalty_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      late_fees: {
        Row: {
          applied_at: string
          borrower_id: string
          configuration_id: string | null
          days_overdue: number
          fee_amount: number
          id: string
          loan_id: string
          paid: boolean
          paid_at: string | null
        }
        Insert: {
          applied_at?: string
          borrower_id: string
          configuration_id?: string | null
          days_overdue: number
          fee_amount: number
          id?: string
          loan_id: string
          paid?: boolean
          paid_at?: string | null
        }
        Update: {
          applied_at?: string
          borrower_id?: string
          configuration_id?: string | null
          days_overdue?: number
          fee_amount?: number
          id?: string
          loan_id?: string
          paid?: boolean
          paid_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "late_fees_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "late_fee_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fees_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "user_loans"
            referencedColumns: ["id"]
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
      loan_applications: {
        Row: {
          agent_id: string
          amount: number
          applicant_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          duration_days: number
          id: string
          interest_rate: number
          loan_product_id: string
          purpose: string | null
          rejected_reason: string | null
          status: string
          total_repayment: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount: number
          applicant_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          duration_days: number
          id?: string
          interest_rate: number
          loan_product_id: string
          purpose?: string | null
          rejected_reason?: string | null
          status?: string
          total_repayment: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          applicant_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          duration_days?: number
          id?: string
          interest_rate?: number
          loan_product_id?: string
          purpose?: string | null
          rejected_reason?: string | null
          status?: string
          total_repayment?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_loan_product_id_fkey"
            columns: ["loan_product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_limits: {
        Row: {
          available_limit: number
          id: string
          total_verified_amount: number
          updated_at: string
          used_limit: number
          user_id: string
        }
        Insert: {
          available_limit?: number
          id?: string
          total_verified_amount?: number
          updated_at?: string
          used_limit?: number
          user_id: string
        }
        Update: {
          available_limit?: number
          id?: string
          total_verified_amount?: number
          updated_at?: string
          used_limit?: number
          user_id?: string
        }
        Relationships: []
      }
      loan_products: {
        Row: {
          active: boolean
          agent_id: string
          created_at: string
          description: string | null
          id: string
          interest_rate: number
          max_amount: number
          max_duration_days: number
          min_amount: number
          min_duration_days: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_id: string
          created_at?: string
          description?: string | null
          id?: string
          interest_rate?: number
          max_amount: number
          max_duration_days?: number
          min_amount: number
          min_duration_days?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          interest_rate?: number
          max_amount?: number
          max_duration_days?: number
          min_amount?: number
          min_duration_days?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      manager_investment_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          investment_account_id: string | null
          manager_id: string | null
          manager_notes: string | null
          processed_at: string | null
          status: string
          supporter_id: string
          supporter_name: string | null
          supporter_phone: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          investment_account_id?: string | null
          manager_id?: string | null
          manager_notes?: string | null
          processed_at?: string | null
          status?: string
          supporter_id: string
          supporter_name?: string | null
          supporter_phone?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          investment_account_id?: string | null
          manager_id?: string | null
          manager_notes?: string | null
          processed_at?: string | null
          status?: string
          supporter_id?: string
          supporter_name?: string | null
          supporter_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_investment_requests_investment_account_id_fkey"
            columns: ["investment_account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_recorded_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          matched: boolean | null
          matched_at: string | null
          matched_confirmation_id: string | null
          notes: string | null
          payment_partner: string
          recorded_by: string
          sender_phone: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          matched?: boolean | null
          matched_at?: string | null
          matched_confirmation_id?: string | null
          notes?: string | null
          payment_partner: string
          recorded_by: string
          sender_phone?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          matched?: boolean | null
          matched_at?: string | null
          matched_confirmation_id?: string | null
          notes?: string | null
          payment_partner?: string
          recorded_by?: string
          sender_phone?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_recorded_transactions_matched_confirmation_id_fkey"
            columns: ["matched_confirmation_id"]
            isOneToOne: false
            referencedRelation: "payment_confirmations"
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
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          created_at: string
          id: string
          message: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_targets: {
        Row: {
          created_at: string
          id: string
          set_by: string
          target_count: number
          target_month: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          set_by: string
          target_count: number
          target_month: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          set_by?: string
          target_count?: number
          target_month?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_confirmations: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          dashboard_type: string
          id: string
          payment_partner: string
          processed_at: string | null
          processed_by: string | null
          screenshot_url: string | null
          status: string
          transaction_date: string | null
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          dashboard_type: string
          id?: string
          payment_partner: string
          processed_at?: string | null
          processed_by?: string | null
          screenshot_url?: string | null
          status?: string
          transaction_date?: string | null
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          dashboard_type?: string
          id?: string
          payment_partner?: string
          processed_at?: string | null
          processed_by?: string | null
          screenshot_url?: string | null
          status?: string
          transaction_date?: string | null
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          direction: string
          id: string
          rent_request_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          rent_request_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          rent_request_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_transactions_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
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
          avatar_url: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          mobile_money_number: string | null
          mobile_money_provider: string | null
          monthly_rent: number | null
          phone: string
          referrer_id: string | null
          rent_discount_active: boolean
          updated_at: string
          verified: boolean
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          phone: string
          referrer_id?: string | null
          rent_discount_active?: boolean
          updated_at?: string
          verified?: boolean
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          phone?: string
          referrer_id?: string | null
          rent_discount_active?: boolean
          updated_at?: string
          verified?: boolean
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
      rent_requests: {
        Row: {
          access_fee: number
          agent_id: string | null
          agent_verified: boolean | null
          agent_verified_at: string | null
          agent_verified_by: string | null
          approval_comment: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          daily_repayment: number
          disbursed_at: string | null
          duration_days: number
          funded_at: string | null
          id: string
          landlord_id: string
          lc1_id: string
          manager_verified: boolean | null
          manager_verified_at: string | null
          manager_verified_by: string | null
          rejected_reason: string | null
          rent_amount: number
          request_fee: number
          status: string | null
          supporter_id: string | null
          tenant_id: string
          total_repayment: number
          updated_at: string
        }
        Insert: {
          access_fee: number
          agent_id?: string | null
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          agent_verified_by?: string | null
          approval_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_repayment: number
          disbursed_at?: string | null
          duration_days: number
          funded_at?: string | null
          id?: string
          landlord_id: string
          lc1_id: string
          manager_verified?: boolean | null
          manager_verified_at?: string | null
          manager_verified_by?: string | null
          rejected_reason?: string | null
          rent_amount: number
          request_fee: number
          status?: string | null
          supporter_id?: string | null
          tenant_id: string
          total_repayment: number
          updated_at?: string
        }
        Update: {
          access_fee?: number
          agent_id?: string | null
          agent_verified?: boolean | null
          agent_verified_at?: string | null
          agent_verified_by?: string | null
          approval_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          daily_repayment?: number
          disbursed_at?: string | null
          duration_days?: number
          funded_at?: string | null
          id?: string
          landlord_id?: string
          lc1_id?: string
          manager_verified?: boolean | null
          manager_verified_at?: string | null
          manager_verified_by?: string | null
          rejected_reason?: string | null
          rent_amount?: number
          request_fee?: number
          status?: string | null
          supporter_id?: string | null
          tenant_id?: string
          total_repayment?: number
          updated_at?: string
        }
        Relationships: [
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
        ]
      }
      repayments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_date: string
          rent_request_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_date?: string
          rent_request_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_date?: string
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
      subagent_team_goals: {
        Row: {
          agent_id: string
          created_at: string
          goal_month: string
          id: string
          notes: string | null
          target_earnings: number
          target_registrations: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          goal_month: string
          id?: string
          notes?: string | null
          target_earnings?: number
          target_registrations?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          goal_month?: string
          id?: string
          notes?: string | null
          target_earnings?: number
          target_registrations?: number
          updated_at?: string
        }
        Relationships: []
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
          activated_at: string | null
          activated_user_id: string | null
          activation_token: string
          created_at: string
          created_by: string
          email: string
          full_name: string
          id: string
          phone: string
          role: string
          status: string
          temp_password: string
        }
        Insert: {
          activated_at?: string | null
          activated_user_id?: string | null
          activation_token?: string
          created_at?: string
          created_by: string
          email: string
          full_name: string
          id?: string
          phone: string
          role?: string
          status?: string
          temp_password: string
        }
        Update: {
          activated_at?: string | null
          activated_user_id?: string | null
          activation_token?: string
          created_at?: string
          created_by?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          role?: string
          status?: string
          temp_password?: string
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
          payment_proof_id: string
          rent_amount: number
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
          payment_proof_id: string
          rent_amount: number
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
          payment_proof_id?: string
          rent_amount?: number
          roi_amount?: number
          status?: string
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_roi_payments_payment_proof_id_fkey"
            columns: ["payment_proof_id"]
            isOneToOne: false
            referencedRelation: "landlord_payment_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_roi_payments_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_roi_payments_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "referral_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
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
      user_achievements: {
        Row: {
          achievement_key: string
          id: string
          metadata: Json | null
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          id?: string
          metadata?: Json | null
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          id?: string
          metadata?: Json | null
          unlocked_at?: string
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
          amount: number
          borrower_id: string
          created_at: string
          due_date: string
          id: string
          interest_rate: number
          lender_id: string
          paid_amount: number
          repaid_at: string | null
          status: string
          total_repayment: number
        }
        Insert: {
          amount: number
          borrower_id: string
          created_at?: string
          due_date: string
          id?: string
          interest_rate?: number
          lender_id: string
          paid_amount?: number
          repaid_at?: string | null
          status?: string
          total_repayment: number
        }
        Update: {
          amount?: number
          borrower_id?: string
          created_at?: string
          due_date?: string
          id?: string
          interest_rate?: number
          lender_id?: string
          paid_amount?: number
          repaid_at?: string | null
          status?: string
          total_repayment?: number
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
      wallet_withdrawals: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          id?: string
          user_id?: string
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
      watched_opportunities: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          rent_request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          rent_request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          rent_request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_opportunities_rent_request_id_fkey"
            columns: ["rent_request_id"]
            isOneToOne: false
            referencedRelation: "rent_requests"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          id: string
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
          created_at?: string
          id?: string
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
          created_at?: string
          id?: string
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
    }
    Functions: {
      create_direct_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      process_monthly_referral_rewards: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "tenant" | "agent" | "landlord" | "supporter" | "manager"
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
      app_role: ["tenant", "agent", "landlord", "supporter", "manager"],
    },
  },
} as const
