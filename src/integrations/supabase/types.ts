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
      general_ledger: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          direction: string
          id: string
          linked_party: string | null
          reference_id: string | null
          running_balance: number | null
          source_id: string | null
          source_table: string
          transaction_date: string
          user_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          linked_party?: string | null
          reference_id?: string | null
          running_balance?: number | null
          source_id?: string | null
          source_table: string
          transaction_date?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          linked_party?: string | null
          reference_id?: string | null
          running_balance?: number | null
          source_id?: string | null
          source_table?: string
          transaction_date?: string
          user_id?: string | null
        }
        Relationships: []
      }
      landlords: {
        Row: {
          account_number: string | null
          bank_name: string | null
          caretaker_name: string | null
          caretaker_phone: string | null
          created_at: string
          description: string | null
          desired_rent_from_welile: number | null
          electricity_meter_number: string | null
          has_smartphone: boolean | null
          id: string
          is_agent_managed: boolean | null
          latitude: number | null
          location_captured_at: string | null
          location_captured_by: string | null
          longitude: number | null
          managed_by_agent_id: string | null
          management_fee_rate: number | null
          mobile_money_number: string | null
          monthly_rent: number | null
          name: string
          number_of_houses: number | null
          number_of_rooms: number | null
          phone: string
          property_address: string
          ready_to_receive: boolean | null
          registered_by: string | null
          tenant_id: string | null
          tin: string | null
          verification_pin_1: string | null
          verification_pin_2: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
          water_meter_number: string | null
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          created_at?: string
          description?: string | null
          desired_rent_from_welile?: number | null
          electricity_meter_number?: string | null
          has_smartphone?: boolean | null
          id?: string
          is_agent_managed?: boolean | null
          latitude?: number | null
          location_captured_at?: string | null
          location_captured_by?: string | null
          longitude?: number | null
          managed_by_agent_id?: string | null
          management_fee_rate?: number | null
          mobile_money_number?: string | null
          monthly_rent?: number | null
          name: string
          number_of_houses?: number | null
          number_of_rooms?: number | null
          phone: string
          property_address: string
          ready_to_receive?: boolean | null
          registered_by?: string | null
          tenant_id?: string | null
          tin?: string | null
          verification_pin_1?: string | null
          verification_pin_2?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
          water_meter_number?: string | null
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          created_at?: string
          description?: string | null
          desired_rent_from_welile?: number | null
          electricity_meter_number?: string | null
          has_smartphone?: boolean | null
          id?: string
          is_agent_managed?: boolean | null
          latitude?: number | null
          location_captured_at?: string | null
          location_captured_by?: string | null
          longitude?: number | null
          managed_by_agent_id?: string | null
          management_fee_rate?: number | null
          mobile_money_number?: string | null
          monthly_rent?: number | null
          name?: string
          number_of_houses?: number | null
          number_of_rooms?: number | null
          phone?: string
          property_address?: string
          ready_to_receive?: boolean | null
          registered_by?: string | null
          tenant_id?: string | null
          tin?: string | null
          verification_pin_1?: string | null
          verification_pin_2?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
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
          full_name: string
          id: string
          last_active_at: string | null
          mobile_money_number: string | null
          mobile_money_provider: string | null
          monthly_rent: number | null
          national_id: string | null
          phone: string
          referrer_id: string | null
          rent_discount_active: boolean
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
          full_name: string
          id: string
          last_active_at?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          national_id?: string | null
          phone: string
          referrer_id?: string | null
          rent_discount_active?: boolean
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
          full_name?: string
          id?: string
          last_active_at?: string | null
          mobile_money_number?: string | null
          mobile_money_provider?: string | null
          monthly_rent?: number | null
          national_id?: string | null
          phone?: string
          referrer_id?: string | null
          rent_discount_active?: boolean
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
          number_of_payments: number | null
          rejected_reason: string | null
          rent_amount: number
          request_city: string | null
          request_country: string | null
          request_fee: number
          request_latitude: number | null
          request_longitude: number | null
          schedule_status: string | null
          status: string | null
          supporter_id: string | null
          tenant_electricity_meter: string | null
          tenant_id: string
          tenant_water_meter: string | null
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
          number_of_payments?: number | null
          rejected_reason?: string | null
          rent_amount: number
          request_city?: string | null
          request_country?: string | null
          request_fee: number
          request_latitude?: number | null
          request_longitude?: number | null
          schedule_status?: string | null
          status?: string | null
          supporter_id?: string | null
          tenant_electricity_meter?: string | null
          tenant_id: string
          tenant_water_meter?: string | null
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
          number_of_payments?: number | null
          rejected_reason?: string | null
          rent_amount?: number
          request_city?: string | null
          request_country?: string | null
          request_fee?: number
          request_latitude?: number | null
          request_longitude?: number | null
          schedule_status?: string | null
          status?: string | null
          supporter_id?: string | null
          tenant_electricity_meter?: string | null
          tenant_id?: string
          tenant_water_meter?: string | null
          total_repayment?: number
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
          latitude: number | null
          location_accuracy: number | null
          longitude: number | null
          parent_agent_id: string | null
          phone: string
          property_address: string | null
          role: string
          status: string
          temp_password: string | null
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
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          parent_agent_id?: string | null
          phone: string
          property_address?: string | null
          role?: string
          status?: string
          temp_password?: string | null
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
          latitude?: number | null
          location_accuracy?: number | null
          longitude?: number | null
          parent_agent_id?: string | null
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
          created_at: string
          id: string
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
          created_at?: string
          id?: string
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
          created_at?: string
          id?: string
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
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_system_events: { Args: never; Returns: undefined }
      create_direct_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      generate_welile_ai_id: { Args: { user_uuid: string }; Returns: string }
      get_email_by_phone: {
        Args: { phone_variants: string[] }
        Returns: {
          email: string
        }[]
      }
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
      refresh_financial_summaries: { Args: never; Returns: undefined }
      resolve_welile_ai_id: { Args: { ai_id: string }; Returns: string }
      update_user_risk_score: {
        Args: { p_reason?: string; p_score_change: number; p_user_id: string }
        Returns: number
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
      app_role: "tenant" | "agent" | "landlord" | "supporter" | "manager"
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
      app_role: ["tenant", "agent", "landlord", "supporter", "manager"],
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
