```mermaid
erDiagram
    ledger_account_groups {
        string group_id
        string group_code
        string description
    }
    ledger_accounts {
        string account_id
        string group_id
        string account_code
        string owner_type
        string owner_id
        string currency
        string allow_negative
        string created_at
    }
    profiles {
        string id
        string full_name
        string phone
        string email
        string created_at
        string updated_at
        string avatar_url
        string verified
        string referrer_id
        string rent_discount_active
        string monthly_rent
        string country
        string city
        string country_code
        string mobile_money_number
        string mobile_money_provider
        string last_active_at
        string whatsapp_verified
        string whatsapp_verified_at
        string agent_type
        string national_id
        string is_frozen
        string frozen_reason
        string frozen_at
        string territory
        string is_seller
        string seller_application_status
        string must_change_password
        string wallet_id
        string always_share_location
        string last_continuous_location_at
        string region
        string district
        string sub_county
        string parish
        string village
        string landmark
        string residence_lat
        string residence_lng
        string residence_updated_at
        string managed_by_agent
        string managing_agent_id
        string tenant_status
        string evicted_at
        string evicted_from_landlord_id
        string signup_source
        string funder_reference
        string funder_verified_at
        string funder_verified_by
        string funder_rejected_at
        string funder_rejection_reason
        string agent_tier
        string forced_default_role
        string forced_default_role_set_by
        string forced_default_role_set_at
    }
    user_roles {
        string id
        string user_id
        string role
        string created_at
        string enabled
    }
    wallets {
        string id
        string user_id
        string balance
        string created_at
        string updated_at
        string locked_balance
        string currency
        string withdrawable_balance
        string float_balance
        string advance_balance
    }
    landlords {
        string id
        string name
        string phone
        string bank_name
        string account_number
        string mobile_money_number
        string property_address
        string created_at
        string tenant_id
        string monthly_rent
        string registered_by
        string verified
        string verified_at
        string verified_by
        string ready_to_receive
        string has_smartphone
        string electricity_meter_number
        string number_of_houses
        string desired_rent_from_welile
        string caretaker_name
        string caretaker_phone
        string water_meter_number
        string latitude
        string longitude
        string location_captured_at
        string location_captured_by
        string description
        string number_of_rooms
        string is_agent_managed
        string managed_by_agent_id
        string management_fee_rate
        string tin
        string verification_pin_1
        string verification_pin_2
        string rent_balance_due
        string rent_last_paid_at
        string rent_last_paid_amount
        string mobile_money_name
        string country
        string region
        string district
        string county
        string sub_county
        string town_council
        string village
        string cell
        string house_number
        string house_category
        string is_occupied
        string updated_at
    }
    lc1_chairpersons {
        string id
        string name
        string phone
        string village
        string created_at
    }
    vendors {
        string id
        string name
        string location
        string phone
        string created_by
        string created_at
        string active
        string pin
        string pin_hash
        string latitude
        string longitude
        string category
    }
    conversations {
        string id
        string created_at
        string updated_at
    }
    conversation_participants {
        string id
        string conversation_id
        string user_id
        string joined_at
        string last_read_at
    }
    messages {
        string id
        string conversation_id
        string sender_id
        string content
        string created_at
        string read_at
    }
    referrals {
        string id
        string referrer_id
        string referred_id
        string bonus_amount
        string credited
        string credited_at
        string created_at
        string first_transaction_bonus_credited
        string first_transaction_bonus_credited_at
        string first_transaction_bonus_amount
    }
    referral_rewards {
        string id
        string user_id
        string reward_month
        string rank
        string reward_amount
        string referral_count
        string credited
        string credited_at
        string created_at
    }
    agent_advances {
        string id
        string agent_id
        string principal
        string outstanding_balance
        string daily_rate
        string cycle_days
        string issued_at
        string expires_at
        string status
        string issued_by
        string created_at
        string updated_at
        string registration_fee
        string access_fee
        string access_fee_collected
        string access_fee_status
        string monthly_rate
    }
    agent_advance_ledger {
        string id
        string advance_id
        string date
        string opening_balance
        string interest_accrued
        string amount_deducted
        string closing_balance
        string deduction_status
        string created_at
    }
    agent_collections {
        string id
        string agent_id
        string tenant_id
        string token_id
        string amount
        string payment_method
        string float_before
        string float_after
        string created_at
        string visit_id
        string momo_provider
        string momo_phone
        string momo_payer_name
        string momo_transaction_id
        string tracking_id
        string location_name
        string sms_sent_agent
        string sms_sent_tenant
        string notes
    }
    agent_commission_payouts {
        string id
        string agent_id
        string amount
        string mobile_money_number
        string mobile_money_provider
        string status
        string transaction_id
        string rejection_reason
        string requested_at
        string processed_at
        string processed_by
        string created_at
        string updated_at
    }
    agent_earnings {
        string id
        string agent_id
        string amount
        string earning_type
        string source_user_id
        string rent_request_id
        string description
        string created_at
    }
    agent_goals {
        string id
        string agent_id
        string goal_month
        string target_registrations
        string target_activations
        string notes
        string created_at
        string updated_at
    }
    agent_receipts {
        string id
        string agent_id
        string payer_name
        string payer_phone
        string amount
        string payment_method
        string transaction_id
        string receipt_image_url
        string notes
        string created_at
    }
    agent_subagents {
        string id
        string parent_agent_id
        string sub_agent_id
        string created_at
        string source
        string status
        string verified_by
        string verified_at
        string rejection_reason
    }
    agent_visits {
        string id
        string agent_id
        string tenant_id
        string latitude
        string longitude
        string accuracy
        string checked_in_at
        string created_at
        string location_name
    }
    ai_chat_messages {
        string id
        string user_id
        string role
        string content
        string created_at
    }
    audit_logs {
        string id
        string user_id
        string action_type
        string table_name
        string record_id
        string metadata
        string created_at
        string action
    }
    credit_access_limits {
        string id
        string user_id
        string base_limit
        string bonus_from_ratings
        string bonus_from_receipts
        string bonus_from_rent_history
        string bonus_from_landlord_rent
        string created_at
        string updated_at
        string bonus_from_houses_listed
        string bonus_from_partners_onboarded
        string total_limit
    }
    credit_request_details {
        string id
        string loan_id
        string borrower_id
        string borrower_phone
        string borrower_mm_name
        string landlord_name
        string landlord_phone
        string landlord_on_platform
        string landlord_id
        string electricity_meter_number
        string water_meter_number
        string location_latitude
        string location_longitude
        string location_address
        string repayment_frequency
        string duration_days
        string platform_fee_rate
        string funder_interest_rate
        string platform_fee_amount
        string total_with_fees
        string agent_id
        string agent_verified
        string agent_verified_at
        string created_at
        string updated_at
    }
    deposit_requests {
        string id
        string user_id
        string agent_id
        string amount
        string status
        string created_at
        string updated_at
        string approved_at
        string rejected_at
        string rejection_reason
        string processed_by
        string provider
        string transaction_id
        string transaction_date
        string notes
        string audit_flagged
        string auto_approved
        string batch_run_id
        string deposit_purpose
        string purpose_audit
    }
    general_ledger {
        string id
        string created_at
        string transaction_date
        string amount
        string direction
        string category
        string description
        string reference_id
        string user_id
        string linked_party
        string source_table
        string source_id
        string running_balance
        string account
        string transaction_group_id
        string ledger_scope
        string currency
        string classification
        string idempotency_key
        string wallet_id
    }
    investment_withdrawal_requests {
        string id
        string user_id
        string amount
        string reason
        string status
        string requested_at
        string earliest_process_date
        string processed_at
        string processed_by
        string rejection_reason
        string created_at
        string updated_at
        string rewards_paused
        string partner_ops_approved_at
        string partner_ops_approved_by
        string coo_approved_at
        string coo_approved_by
        string cfo_processed_at
        string cfo_processed_by
    }
    investor_portfolios {
        string id
        string investor_id
        string invite_id
        string agent_id
        string portfolio_code
        string investment_amount
        string duration_months
        string roi_percentage
        string roi_mode
        string payment_method
        string mobile_network
        string mobile_money_number
        string bank_name
        string account_name
        string account_number
        string status
        string portfolio_pin
        string activation_token
        string created_at
        string maturity_date
        string next_roi_date
        string total_roi_earned
        string payout_day
        string display_currency
        string auto_reinvest
        string maturity_alert_30d
        string maturity_alert_7d
        string bank_account_name
        string investment_reference
        string receipt_file_url
        string cfo_verified
        string cfo_verified_at
        string cfo_verified_by
        string cfo_rejection_reason
    }
    location_requests {
        string id
        string token
        string rent_request_id
        string target_role
        string target_user_id
        string requested_by
        string latitude
        string longitude
        string accuracy
        string captured_at
        string created_at
        string status
    }
    money_requests {
        string id
        string requester_id
        string recipient_id
        string amount
        string description
        string status
        string created_at
        string responded_at
    }
    operations_departments {
        string id
        string user_id
        string department
        string assigned_by
        string created_at
    }
    opportunity_summaries {
        string id
        string total_rent_requested
        string total_requests
        string total_landlords
        string total_agents
        string notes
        string posted_by
        string created_at
        string updated_at
    }
    otp_verifications {
        string id
        string phone
        string otp_code
        string expires_at
        string attempts
        string verified
        string verified_at
        string created_at
        string updated_at
    }
    payment_tokens {
        string id
        string agent_id
        string tenant_id
        string token_code
        string amount
        string expires_at
        string used
        string used_at
        string visit_id
        string created_at
    }
    pending_wallet_operations {
        string id
        string user_id
        string amount
        string direction
        string category
        string description
        string source_table
        string source_id
        string transaction_group_id
        string linked_party
        string reference_id
        string account
        string status
        string reviewed_by
        string reviewed_at
        string rejection_reason
        string created_at
        string updated_at
        string metadata
        string operation_type
        string target_wallet_user_id
        string payment_method
        string payment_reference
    }
    push_subscriptions {
        string id
        string user_id
        string endpoint
        string p256dh
        string auth
        string created_at
        string updated_at
    }
    receipt_numbers {
        string id
        string receipt_code
        string vendor_id
        string created_by
        string created_at
        string vendor_amount
        string vendor_marked_at
        string status
    }
    rent_history_records {
        string id
        string tenant_id
        string landlord_name
        string landlord_phone
        string property_location
        string rent_amount
        string months_paid
        string start_date
        string end_date
        string status
        string verified_at
        string verified_by
        string rejection_reason
        string created_at
        string updated_at
        string tenant_ops_verified_at
        string tenant_ops_verified_by
        string agent_ops_verified_at
        string agent_ops_verified_by
        string landlord_ops_verified_at
        string landlord_ops_verified_by
        string verification_notes
    }
    rent_requests {
        string id
        string tenant_id
        string agent_id
        string landlord_id
        string lc1_id
        string rent_amount
        string duration_days
        string access_fee
        string request_fee
        string total_repayment
        string daily_repayment
        string status
        string supporter_id
        string approved_by
        string approved_at
        string funded_at
        string disbursed_at
        string created_at
        string updated_at
        string approval_comment
        string rejected_reason
        string agent_verified
        string agent_verified_at
        string agent_verified_by
        string manager_verified
        string manager_verified_at
        string manager_verified_by
        string schedule_status
        string number_of_payments
        string fund_recipient_type
        string fund_recipient_id
        string fund_recipient_name
        string fund_routed_at
        string tenant_water_meter
        string tenant_electricity_meter
        string request_latitude
        string request_longitude
        string request_city
        string request_country
        string house_category
        string amount_repaid
        string next_roi_due_date
        string total_roi_paid
        string roi_payments_count
        string tenant_no_smartphone
        string tenant_ops_reviewed_by
        string tenant_ops_reviewed_at
        string assigned_agent_id
        string landlord_ops_reviewed_by
        string landlord_ops_reviewed_at
        string coo_reviewed_by
        string coo_reviewed_at
        string cfo_reviewed_by
        string cfo_reviewed_at
        string payout_transaction_reference
        string payout_method
        string house_image_urls
        string registration_type
        string initial_outstanding_balance
        string landlord_called
        string landlord_acknowledged
        string landlord_verification_method
        string landlord_call_notes
        string tenancy_status
        string tenancy_ended_at
        string tenancy_end_reason
        string outstanding_at_end
        string rejected_at
        string rejected_at_stage
        string reopened_at
        string reopened_by
        string reopen_count
        string reopen_reason
        string preferred_language
        string tenant_ops_comment
        string landlord_ops_comment
        string agent_ops_comment
        string agent_ops_reviewed_by
        string agent_ops_reviewed_at
    }
    repayments {
        string id
        string tenant_id
        string rent_request_id
        string amount
        string created_at
    }
    staff_profiles {
        string id
        string user_id
        string employee_id
        string department
        string position
        string must_change_password
        string created_by
        string created_at
        string updated_at
        string job_title
        string agreement_accepted
    }
    subscription_charge_logs {
        string id
        string subscription_id
        string tenant_id
        string charge_amount
        string amount_deducted
        string debt_added
        string wallet_balance_before
        string wallet_balance_after
        string status
        string charge_date
        string created_at
    }
    subscription_charges {
        string id
        string tenant_id
        string rent_request_id
        string service_type
        string charge_amount
        string frequency
        string next_charge_date
        string start_date
        string end_date
        string total_charges_due
        string total_charged
        string accumulated_debt
        string charges_completed
        string charges_remaining
        string status
        string created_at
        string updated_at
        string agent_id
        string agent_charged_amount
        string agent_charge_count
        string charge_agent_wallet
        string tenant_failed_at
        string consecutive_failures
    }
    supporter_agreement_acceptance {
        string id
        string supporter_id
        string agreement_version
        string accepted_at
        string ip_address
        string device_info
        string status
        string created_at
    }
    supporter_invites {
        string id
        string email
        string full_name
        string phone
        string temp_password
        string activation_token
        string created_by
        string created_at
        string activated_at
        string activated_user_id
        string status
        string role
        string parent_agent_id
        string latitude
        string longitude
        string location_accuracy
        string property_address
        string national_id
        string country
        string district_city
        string next_of_kin_name
        string next_of_kin_relationship
        string next_of_kin_phone
        string payment_method
        string mobile_network
        string mobile_money_number
        string bank_name
        string account_name
        string account_number
    }
    supporter_referrals {
        string id
        string referrer_id
        string referred_id
        string bonus_amount
        string bonus_credited
        string bonus_credited_at
        string first_investment_at
        string created_at
    }
    supporter_roi_payments {
        string id
        string rent_request_id
        string supporter_id
        string rent_amount
        string roi_amount
        string payment_number
        string due_date
        string paid_at
        string created_at
        string status
    }
    system_events {
        string id
        string event_type
        string user_id
        string related_entity_type
        string related_entity_id
        string metadata
        string processed
        string processed_at
        string created_at
    }
    tenant_agreement_acceptance {
        string id
        string tenant_id
        string agreement_version
        string accepted_at
        string ip_address
        string device_info
        string status
        string created_at
    }
    tenant_merchant_payments {
        string id
        string agent_id
        string tenant_id
        string tenant_phone
        string transaction_id
        string amount
        string merchant_name
        string payment_date
        string notes
        string created_at
        string updated_at
    }
    tenant_ratings {
        string id
        string tenant_id
        string landlord_id
        string rating
        string created_at
        string updated_at
    }
    user_activity_log {
        string id
        string user_id
        string activity_type
        string description
        string metadata
        string performed_by
        string created_at
    }
    user_loans {
        string id
        string borrower_id
        string lender_id
        string amount
        string interest_rate
        string total_repayment
        string status
        string due_date
        string created_at
        string repaid_at
        string paid_amount
        string agent_verified
        string agent_verified_by
        string agent_verified_at
        string ai_insurance_accepted
        string ai_insurance_accepted_at
        string repayment_frequency
    }
    user_locations {
        string id
        string user_id
        string latitude
        string longitude
        string accuracy
        string address
        string city
        string country
        string captured_at
        string verified
        string verified_by
        string verified_at
        string verification_notes
        string created_at
    }
    user_reviews {
        string id
        string reviewer_id
        string reviewed_user_id
        string rating
        string review_text
        string reviewer_role
        string created_at
        string updated_at
    }
    user_risk_scores {
        string id
        string user_id
        string risk_score
        string risk_level
        string consecutive_on_time_payments
        string consecutive_missed_payments
        string total_missed_payments
        string total_on_time_payments
        string last_payment_date
        string last_risk_update
        string notes
        string created_at
        string updated_at
    }
    wallet_deposits {
        string id
        string user_id
        string agent_id
        string amount
        string deposit_type
        string created_at
    }
    wallet_transactions {
        string id
        string sender_id
        string recipient_id
        string amount
        string description
        string created_at
    }
    welile_homes_subscriptions {
        string id
        string tenant_id
        string landlord_id
        string monthly_rent
        string subscription_status
        string landlord_registered
        string total_savings
        string months_enrolled
        string notes
        string created_at
        string updated_at
        string last_interest_applied_at
        string email_statements_enabled
        string last_statement_sent_at
    }
    withdrawal_requests {
        string id
        string user_id
        string amount
        string status
        string processed_by
        string processed_at
        string rejection_reason
        string created_at
        string updated_at
        string mobile_money_number
        string mobile_money_provider
        string transaction_id
        string mobile_money_name
        string manager_approved_at
        string manager_approved_by
        string cfo_approved_at
        string cfo_approved_by
        string coo_approved_at
        string coo_approved_by
        string transaction_time
        string payout_method
        string bank_name
        string bank_account_number
        string bank_account_name
        string agent_location
        string agent_id
        string payout_proof
        string payout_proof_type
        string payout_code
        string assigned_cashout_agent_id
        string priority_level
        string auto_dispatched
        string dispatched_at
        string fin_ops_reference
        string fin_ops_verified_by
        string fin_ops_verified_at
        string fin_ops_approved_at
        string fin_ops_approved_by
        string reason
        string fin_ops_payment_method
        string linked_party
        string proxy_partner_id
        string client_request_id
    }
    backup_runs {
        string id
        string storage_path
        string size_bytes
        string table_count
        string row_count
        string status
        string error_message
        string recipients
        string created_at
    }

    %% Relationships
    ledger_account_groups ||--o{ ledger_account_groups : "group_id"
    ledger_accounts ||--o{ ledger_accounts : "account_id"
    ledger_account_groups ||--o{ ledger_accounts : "group_id"
    profiles ||--o{ profiles : "referrer_id"
    wallets ||--o{ profiles : "wallet_id"
    profiles ||--o{ user_roles : "user_id"
    profiles ||--o{ wallets : "user_id"
    profiles ||--o{ landlords : "tenant_id"
    conversations ||--o{ conversation_participants : "conversation_id"
    profiles ||--o{ conversation_participants : "user_id"
    conversations ||--o{ messages : "conversation_id"
    profiles ||--o{ referrals : "referrer_id"
    profiles ||--o{ referral_rewards : "user_id"
    profiles ||--o{ agent_advances : "agent_id"
    profiles ||--o{ agent_collections : "agent_id"
    profiles ||--o{ agent_collections : "tenant_id"
    profiles ||--o{ agent_commission_payouts : "agent_id"
    profiles ||--o{ agent_earnings : "agent_id"
    rent_requests ||--o{ agent_earnings : "rent_request_id"
    profiles ||--o{ agent_goals : "agent_id"
    profiles ||--o{ agent_receipts : "agent_id"
    profiles ||--o{ agent_visits : "agent_id"
    profiles ||--o{ agent_visits : "tenant_id"
    profiles ||--o{ ai_chat_messages : "user_id"
    profiles ||--o{ audit_logs : "user_id"
    profiles ||--o{ credit_access_limits : "user_id"
    landlords ||--o{ credit_request_details : "landlord_id"
    profiles ||--o{ credit_request_details : "agent_id"
    profiles ||--o{ deposit_requests : "user_id"
    profiles ||--o{ deposit_requests : "agent_id"
    profiles ||--o{ general_ledger : "user_id"
    wallets ||--o{ general_ledger : "wallet_id"
    profiles ||--o{ investment_withdrawal_requests : "user_id"
    profiles ||--o{ investor_portfolios : "agent_id"
    rent_requests ||--o{ location_requests : "rent_request_id"
    profiles ||--o{ operations_departments : "user_id"
    profiles ||--o{ payment_tokens : "agent_id"
    profiles ||--o{ payment_tokens : "tenant_id"
    profiles ||--o{ pending_wallet_operations : "user_id"
    profiles ||--o{ push_subscriptions : "user_id"
    vendors ||--o{ receipt_numbers : "vendor_id"
    profiles ||--o{ rent_history_records : "tenant_id"
    profiles ||--o{ rent_requests : "tenant_id"
    profiles ||--o{ rent_requests : "agent_id"
    landlords ||--o{ rent_requests : "landlord_id"
    profiles ||--o{ rent_requests : "supporter_id"
    profiles ||--o{ repayments : "tenant_id"
    rent_requests ||--o{ repayments : "rent_request_id"
    profiles ||--o{ staff_profiles : "user_id"
    profiles ||--o{ subscription_charge_logs : "tenant_id"
    profiles ||--o{ subscription_charges : "tenant_id"
    rent_requests ||--o{ subscription_charges : "rent_request_id"
    profiles ||--o{ subscription_charges : "agent_id"
    profiles ||--o{ supporter_agreement_acceptance : "supporter_id"
    profiles ||--o{ supporter_referrals : "referrer_id"
    rent_requests ||--o{ supporter_roi_payments : "rent_request_id"
    profiles ||--o{ supporter_roi_payments : "supporter_id"
    profiles ||--o{ system_events : "user_id"
    profiles ||--o{ tenant_agreement_acceptance : "tenant_id"
    profiles ||--o{ tenant_merchant_payments : "agent_id"
    profiles ||--o{ tenant_merchant_payments : "tenant_id"
    profiles ||--o{ tenant_ratings : "tenant_id"
    landlords ||--o{ tenant_ratings : "landlord_id"
    profiles ||--o{ user_activity_log : "user_id"
    profiles ||--o{ user_locations : "user_id"
    profiles ||--o{ user_risk_scores : "user_id"
    profiles ||--o{ wallet_deposits : "user_id"
    profiles ||--o{ wallet_deposits : "agent_id"
    profiles ||--o{ welile_homes_subscriptions : "tenant_id"
    landlords ||--o{ welile_homes_subscriptions : "landlord_id"
    profiles ||--o{ withdrawal_requests : "user_id"
    profiles ||--o{ withdrawal_requests : "agent_id"
```
