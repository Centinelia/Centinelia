-- Extend target_document to allow 'mdp' (Micro-Decision Playbook)
-- MDP learnings are injected in a separate prompt block as CUANDO/ENTONCES conditionals

ALTER TABLE conversational_learnings
  DROP CONSTRAINT IF EXISTS conversational_learnings_target_document_check;

ALTER TABLE conversational_learnings
  ADD CONSTRAINT conversational_learnings_target_document_check
  CHECK (target_document IN ('cce', 'hcp', 'mdp'));
