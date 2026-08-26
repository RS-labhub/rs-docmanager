-- DEPRECATED — do not run this file. Seeding is now handled by the server
-- at POST /api/seed (see app/api/seed/route.ts), which creates users via
-- Supabase Auth, inserts profiles/orgs/documents/agents, and refuses to
-- run if a profile already exists or (in production) unless
-- ALLOW_PROD_SEED=true. To seed a fresh database:
--   curl -X POST http://localhost:3000/api/seed -H "x-seed-token: $SEED_SECRET"

-- Organizations
INSERT INTO organizations (id, name, slug, org_code, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corporation',  'acme',    'ACME2026', 'The Acme Corporation — makers of everything'),
  ('00000000-0000-0000-0000-000000000002', 'Globex Industries', 'globex',  'GLOBEX01', 'Globex — pushing the boundaries of innovation'),
  ('00000000-0000-0000-0000-000000000003', 'Initech Labs',      'initech', 'INIT3CHX', 'Initech — enterprise solutions');

-- Profiles  (passwords are managed at app level with bcrypt)
-- God user (no org — sees everything)
INSERT INTO profiles (id, email, full_name, role, org_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'god@system.local', 'System God', 'god', NULL, true);

-- Super admins (assigned to orgs)
INSERT INTO profiles (id, email, full_name, role, org_id, is_active) VALUES
  ('20000000-0000-0000-0000-000000000001', 'superadmin@acme.com',   'Alice Wong',   'super_admin', '00000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000002', 'superadmin@globex.com', 'Bob Martinez', 'super_admin', '00000000-0000-0000-0000-000000000002', true);

-- Admins
INSERT INTO profiles (id, email, full_name, role, org_id, is_active) VALUES
  ('30000000-0000-0000-0000-000000000001', 'admin@acme.com',   'Carol Chen',    'admin', '00000000-0000-0000-0000-000000000001', true),
  ('30000000-0000-0000-0000-000000000002', 'admin@globex.com', 'David Kim',     'admin', '00000000-0000-0000-0000-000000000002', true),
  ('30000000-0000-0000-0000-000000000003', 'admin@initech.com','Eve Johnson',   'admin', '00000000-0000-0000-0000-000000000003', true);

-- Regular users
INSERT INTO profiles (id, email, full_name, role, org_id, is_active) VALUES
  ('40000000-0000-0000-0000-000000000001', 'user1@acme.com',   'Frank Lee',     'user', '00000000-0000-0000-0000-000000000001', true),
  ('40000000-0000-0000-0000-000000000002', 'user2@acme.com',   'Grace Park',    'user', '00000000-0000-0000-0000-000000000001', true),
  ('40000000-0000-0000-0000-000000000003', 'user1@globex.com', 'Hank Wilson',   'user', '00000000-0000-0000-0000-000000000002', true),
  ('40000000-0000-0000-0000-000000000004', 'user1@initech.com','Ivy Nguyen',    'user', '00000000-0000-0000-0000-000000000003', true);

-- Sample documents
INSERT INTO documents (id, title, content, owner_id, org_id, is_public, tags) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Getting Started Guide',
   'Welcome to the AI Document Management System. This guide will help you understand the key features including document management, AI-powered analysis, role-based access control, and organization-scoped workflows.',
   '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', true, ARRAY['guide', 'onboarding']),

  ('d0000000-0000-0000-0000-000000000002', 'Security Policy',
   'This document outlines our security policies including data encryption at rest and in transit, role-based access control with four-tier hierarchy, organization isolation, and audit logging for all sensitive operations.',
   '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', false, ARRAY['security', 'policy']),

  ('d0000000-0000-0000-0000-000000000003', 'Product Roadmap Q1 2026',
   'Q1 2026 Roadmap: 1) Enhanced AI document parsing with RAG pipeline 2) Multi-organization support 3) Advanced permission management 4) Real-time collaboration features 5) Mobile-responsive dashboard redesign.',
   '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', false, ARRAY['roadmap', 'planning']),

  ('d0000000-0000-0000-0000-000000000004', 'Globex Innovation Brief',
   'Globex is pioneering next-generation AI integration for enterprise document workflows. Our approach combines fine-grained authorization with intelligent document processing.',
   '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', true, ARRAY['innovation', 'brief']),

  ('d0000000-0000-0000-0000-000000000005', 'Initech Compliance Report',
   'Annual compliance report covering GDPR, SOC2, and ISO 27001 requirements. All systems have been audited and meet the required standards.',
   '30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', false, ARRAY['compliance', 'report']);

-- AI Agents
INSERT INTO ai_agents (id, name, description, role, capabilities, org_id, created_by, is_active) VALUES

-- Credentials (password: "Password123!" — bcrypt hash)
-- Generate with: node -e "require('bcryptjs').hash('Password123!', 12).then(h => console.log(h))"
INSERT INTO credentials (user_id, password_hash) VALUES
  ('10000000-0000-0000-0000-000000000001', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('20000000-0000-0000-0000-000000000001', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('20000000-0000-0000-0000-000000000002', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('30000000-0000-0000-0000-000000000001', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('30000000-0000-0000-0000-000000000002', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('30000000-0000-0000-0000-000000000003', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('40000000-0000-0000-0000-000000000001', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('40000000-0000-0000-0000-000000000002', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('40000000-0000-0000-0000-000000000003', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u'),
  ('40000000-0000-0000-0000-000000000004', '$2a$12$LJ3a7lFzT4bR4Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5u');

-- NOTE: The hashes above are placeholders. Run the seed script at /api/seed to generate proper bcrypt hashes for "Password123!"

-- AI Agents
INSERT INTO ai_agents (id, name, description, role, capabilities, org_id, created_by, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Document Assistant',
   'Helps with document organization, summarization, and basic tasks',
   'assistant', ARRAY['read_documents','suggest_edits','summarize_content'],
   '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', true),

  ('a0000000-0000-0000-0000-000000000002', 'Content Editor',
   'AI that can edit and improve document content with suggestions',
   'editor', ARRAY['read_documents','edit_documents','generate_content'],
   '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', true),

  ('a0000000-0000-0000-0000-000000000003', 'Document Analyzer',
   'Analyzes document content and provides deep insights',
   'analyzer', ARRAY['read_documents','analyze_content','summarize_content'],
   '00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', true);
