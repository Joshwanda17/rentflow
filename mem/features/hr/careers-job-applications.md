---
name: Careers / Job Applications
description: Public /careers job application form + priority panel on Company Staff dashboard
type: feature
---
Public `/careers` page (src/pages/Careers.tsx) lets anyone apply for jobs (categories: developer [100+], sales [1000+], marketing, operations, other). WhatsApp number and email fields are visually highlighted. Linked from Agent Menu Drawer "More" section under "Internship Program" via "Apply for a Job" -> /careers.

Data goes to `job_applications` table (anon INSERT allowed via RLS; staff roles manager/super_admin/coo/hr/cto/operations/ceo can SELECT + UPDATE). Fields: full_name, whatsapp_number, email, category, role_interest, experience_level, portfolio_url, location, cover_note, status (new/contacted), contacted_by, contacted_at.

Surfaced as a priority panel (JobApplicationsPanel) at the top of the Company Staff dashboard (/admin/users). Staff contact via WhatsApp (wa.me link) or email (mailto cc info@welile.com) and "Mark contacted". New-count priority badge.
