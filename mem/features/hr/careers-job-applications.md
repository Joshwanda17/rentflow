---
name: Careers / Job Applications
description: Public /careers job application form + priority panel on Company Staff dashboard
type: feature
---
Public `/careers` page (src/pages/Careers.tsx) lets anyone apply for jobs (categories: developer [100+], sales [1000+], marketing, operations, other). WhatsApp number and email fields are visually highlighted. Linked from Agent Menu Drawer "More" section under "Internship Program" via "Apply for a Job" -> /careers.

Data goes to `job_applications` table (anon INSERT allowed via RLS; staff roles manager/super_admin/coo/hr/cto/operations/ceo can SELECT + UPDATE). Fields: full_name, whatsapp_number, email, category, role_interest, experience_level, portfolio_url, location, cover_note, status (new/contacted), contacted_by, contacted_at.

Surfaced as a priority panel (JobApplicationsPanel) at the top of the Company Staff dashboard (/admin/users). Staff contact via WhatsApp (wa.me link) or email (mailto cc info@welile.com). New-count priority badge.

Applicant status workflow (pipeline): new -> contacted -> interviewing -> hired (+ rejected). Each card has a dropdown to change status (sets contacted_by/contacted_at when moving off "new"). Panel has status pipeline filter tabs with per-status counts, a category filter, and sort options (newest, oldest, name A-Z, pipeline stage). Status is stored in the free-text job_applications.status column (no enum/schema change).
