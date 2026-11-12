# BEP Financial Intelligence Engine

## Architecture
The engine is a retrieval-augmented reasoning layer attached to the existing BEP AI provider. It does not train or replace the foundation model. It retrieves versioned, sourced financial knowledge and accepted user-specific coaching notes, then injects only the most relevant passages into the existing AI request.

## Safety boundaries
- Deterministic financial calculations remain in BEP.
- AI-generated knowledge stays pending until the user accepts it.
- Personal accepted knowledge is scoped by user_id and never enters the shared corpus.
- The shared corpus contains curated general guidance with source metadata.
- Monthly plans, actual expenses and savings ledger entries remain distinct.
- Closed month snapshots are read-only context; the engine never writes financial data.
- Feature flag: BEP_FINANCIAL_INTELLIGENCE_ENABLED. It defaults to false. Enable only on the pre-production service after deploying the branch.

## Corpus and retrieval
Seed records are versioned in lib/bep-financial-knowledge-seed.js and persisted idempotently to bep_financial_knowledge. Retrieval currently uses transparent lexical scoring plus context signals. This first version intentionally avoids embeddings and model fine-tuning until the corpus and evaluation set are large and trustworthy.

## Updating the knowledge
Curated seed updates are deployed with a version increment. Future collector jobs should create proposed records with source, publication date, evidence level and review status; never publish scraped content directly. Every update must be deduplicated, source-checked, tested against the evaluation set and reversible.

## What "training" means here
This phase builds BEP's proprietary knowledge corpus and retrieval system. It does not fine-tune model weights. This keeps BEP portable across model providers and avoids confusing a larger document library with model training.

## Pre-production configuration
Set BEP_FINANCIAL_INTELLIGENCE_ENABLED=true on the staging API only. Keep it unset/false on production. No provider key or database URL is added to source control.
