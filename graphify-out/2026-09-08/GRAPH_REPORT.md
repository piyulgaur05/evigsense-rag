# Graph Report - jyoma-ai  (2026-09-08)

## Corpus Check
- 382 files · ~326,183 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2049 nodes · 5101 edges · 214 communities (100 shown, 99 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `508c8324`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- RequisitionEditor.tsx
- cn
- button.tsx
- Documents.tsx
- utils.ts
- TaxonomyManager.tsx
- TecPanel.tsx
- PaymentPanel.tsx
- formatMoney
- sidebar.tsx
- TenderPanel.tsx
- procurement/types.ts
- useProcurement.ts
- AppHeader.tsx
- api/tender.ts
- CommercialPanel.tsx
- translationMarkdown.ts
- hooks/use-toast.ts
- cases.ts
- api/masterData.ts
- compilerOptions
- PortalLayout.tsx
- SideBySideView.tsx
- ProcurementHome.tsx
- TranslationMarkdown.tsx
- CaseDocuments.tsx
- embed
- ai.ts
- Application Logging System
- ProcurementInsights.tsx
- chatCompletionText
- ocr.ts
- DocumentManagement.tsx
- api/commercial.ts
- insights.ts
- GoodsReceiptPanel.tsx
- extract-document-text/index.ts
- main.py
- cst.ts
- dependencies
- DGX Spark Handover
- App.tsx
- compilerOptions
- ProcurementSignIn.tsx
- components.json
- seed-procurement.mjs
- Logger
- devDependencies
- 10. Testing
- 4. Stage by stage
- seed-users.mjs
- useAuth
- MetadataTemplateManager.tsx
- Assistant.tsx
- scripts
- carousel.tsx
- PncPanel.tsx
- Procurement
- check-procurement-api.mjs
- purchaseOrder.ts
- CstPanel.tsx
- payment-ai-draft/index.ts
- Spark Start Genie (EVIGSENSE)
- DocumentChat.tsx
- TranslationHistory.tsx
- form.tsx
- goodsReceipt.ts
- wopi-host/index.ts
- Translation Markdown Workflow
- chart.tsx
- negotiation.ts
- supabase/types.ts
- compilerOptions
- mermaidComponents.tsx
- Dashboard.tsx
- signatures.ts
- Run the stack
- pagination.tsx
- lib/masterData.ts
- payment.ts
- package.json
- bootstrap.ps1
- drawer.tsx
- navigation-menu.tsx
- vendors.ts
- Jyoma AI (EVIGSENSE) — working notes
- toggle-group.tsx
- generate-jwt-keys.mjs
- 5. Roles, permissions and desks
- proposal.ts
- extract-boq/index.ts
- rag-assistant/index.ts
- Procurement
- Model servers on DGX Spark
- input-otp.tsx
- usePdfTranslation.ts
- useTranslation.ts
- process-large-document/index.ts
- 7. The data model
- block
- auto-populate-metadata/index.ts
- apply-organization-rules/index.ts
- ingest-logs/index.ts
- clsx
- date-fns
- z2-set-role-passwords.sh
- vllm/README.md
- embla-carousel-react
- @eslint/js
- eslint-plugin-react-hooks
- fabric
- @fontsource/dancing-script
- @fontsource/ibm-plex-mono
- @fontsource-variable/archivo
- @fontsource-variable/ibm-plex-sans
- globals
- @hookform/resolvers
- input-otp
- katex
- lucide-react
- mammoth
- next-themes
- exceljs
- mermaid
- pdf-lib
- pdfjs-dist
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-checkbox
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toast
- @radix-ui/react-toggle
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react
- react-day-picker
- react-dom
- react-hook-form
- react-markdown
- react-resizable-panels
- react-router-dom
- remark-gfm
- remark-math
- signature_pad
- sonner
- @supabase/supabase-js
- tailwind-merge
- tailwindcss-animate
- @tanstack/react-query
- @tiptap/extension-font-family
- @tiptap/extension-placeholder
- @tiptap/extension-table
- @tiptap/extension-table-cell
- @tiptap/extension-table-header
- @tiptap/extension-table-row
- @tiptap/extension-text-align
- @tiptap/extension-text-style
- @tiptap/react
- @tiptap/starter-kit
- vaul
- zod
- @tailwindcss/typography
- @types/react
- @types/react-dom
- typescript
- vite
- @vitejs/plugin-react
- apply-migrations.sh
- check-procurement.sh
- gen-types.sh
- append-signature-page/index.ts
- cleanup-document/index.ts
- convert-scanned-pdf/index.ts
- create-user/index.ts
- delete-document/index.ts
- delete-user/index.ts
- list-users/index.ts
- merge-document-chunks/index.ts
- process-queue/index.ts
- reset-stuck-documents/index.ts
- setup-default-metadata-fields/index.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 311 edges
2. `Button` - 76 edges
3. `supabase` - 59 edges
4. `useAuth()` - 55 edges
5. `formatMoney()` - 50 edges
6. `Input` - 40 edges
7. `Label` - 38 edges
8. `useTenderMutation()` - 37 edges
9. `SelectTrigger` - 31 edges
10. `SelectContent` - 31 edges

## Surprising Connections (you probably didn't know these)
- `BlockGrid()` --calls--> `cn()`  [EXTRACTED]
  src/components/translation-markdown/SideBySideView.tsx → src/lib/utils.ts
- `Carousel` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/carousel.tsx → src/lib/utils.ts
- `ChartContainer` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/chart.tsx → src/lib/utils.ts
- `CommandSeparator` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/command.tsx → src/lib/utils.ts
- `CommandShortcut()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/command.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (214 total, 99 thin omitted)

### Community 0 - "RequisitionEditor.tsx"
Cohesion: 0.07
Nodes (48): CaseAnswer, CaseAnswerSource, CaseDocumentReadiness, fetchCaseDocumentReadiness(), BOQ_IMPORT_ACCEPT, BoqExtraction, extractBoqFromDocument(), extractBoqFromText() (+40 more)

### Community 1 - "cn"
Cohesion: 0.06
Nodes (45): AccordionContent, AccordionItem, AccordionTrigger, AlertDialogOverlay, AvatarImage, Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem (+37 more)

### Community 2 - "button.tsx"
Cohesion: 0.13
Nodes (35): ACCESS_LEVELS, FolderData, FolderPermission, FolderPermissionsManager(), UserProfile, WordEditorDialogProps, FolderDialogProps, PRESET_COLORS (+27 more)

### Community 3 - "Documents.tsx"
Cohesion: 0.10
Nodes (35): DropZone(), DropZoneProps, Folder, OrganizationRule, OrganizationRulesManager(), PDFSplitter(), AlertDialogAction, AlertDialogCancel (+27 more)

### Community 4 - "utils.ts"
Cohesion: 0.10
Nodes (31): ApplyTemplateDialog(), ApplyTemplateDialogProps, Template, DocumentMetadataEditor(), DocumentMetadataEditorProps, MetadataField, MetadataValue, MetadataField (+23 more)

### Community 5 - "TaxonomyManager.tsx"
Cohesion: 0.12
Nodes (30): AudioVideoViewerProps, Layout(), LayoutProps, EnrichedMetadata, EnrichedMetadataDialog(), EnrichedMetadataDialogProps, formatBytes(), getEntityIcon() (+22 more)

### Community 6 - "TecPanel.tsx"
Cohesion: 0.08
Nodes (34): fetchTecAiSuggestions(), fetchTecChecklist(), fetchTecConsensus(), fetchTecEvaluations(), fetchTecGaps(), saveTecChecklistItem(), TecAiEvaluateResult, unwrap() (+26 more)

### Community 7 - "PaymentPanel.tsx"
Cohesion: 0.11
Nodes (24): FormSection(), LookupField(), NONE, pickLookup(), ReadinessChecklist(), RequiredLabel(), useBidders(), usePaymentAiDraft() (+16 more)

### Community 8 - "formatMoney"
Cohesion: 0.15
Nodes (25): CaseSignatures(), ClarificationThread(), StageIndex(), TenderNotice(), useCase(), useCaseSignatures(), useClarifications(), usePostClarification() (+17 more)

### Community 9 - "sidebar.tsx"
Cohesion: 0.08
Nodes (29): Separator, Sidebar, SidebarContent, SidebarContext, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent (+21 more)

### Community 10 - "TenderPanel.tsx"
Cohesion: 0.11
Nodes (30): useCloseBidding(), useCorrigenda(), useFloatTender(), useLinkNoticeDocument(), usePublishBoqToTender(), useReplaceInvitees(), useSaveTender(), useTender() (+22 more)

### Community 11 - "procurement/types.ts"
Cohesion: 0.06
Nodes (31): ApprovalKind, ApprovalStatus, Bidder, BidderStatus, BidderWithQuote, CaseDocumentLink, ClarificationKind, ClarificationWithAuthor (+23 more)

### Community 12 - "useProcurement.ts"
Cohesion: 0.15
Nodes (29): BidderRoster(), num(), CorrigendumList(), VendorPanel(), procurementKeys, useAmendPurchaseOrder(), useCaseSignaturesNamed(), useCreateVendor() (+21 more)

### Community 13 - "AppHeader.tsx"
Cohesion: 0.09
Nodes (25): AppHeader(), items, FolderPermissionsDialog(), FolderNode, FolderTree(), FolderTreeProps, NavLink, NavLinkCompatProps (+17 more)

### Community 14 - "api/tender.ts"
Cohesion: 0.07
Nodes (18): fetchBidders(), fetchBidSubmissions(), fetchCorrigenda(), fetchInvitees(), fetchTender(), fetchTenderGaps(), fetchTenderItems(), fetchTenderSummary() (+10 more)

### Community 15 - "CommercialPanel.tsx"
Cohesion: 0.11
Nodes (25): ComparativeMatrix(), useCommercialGaps(), useCommercialLineComparison(), useCommercialQuotes(), useCommercialRanking(), useCommercialReasonableness(), useCommercialRecord(), useSaveQuote() (+17 more)

### Community 16 - "translationMarkdown.ts"
Cohesion: 0.11
Nodes (27): blobToDataUri(), PdfPagePng, RenderOptions, renderPdfToImages(), DocumentRow, generateOCRMarkdown(), getDefaultConcurrency(), isImageDoc() (+19 more)

### Community 17 - "hooks/use-toast.ts"
Cohesion: 0.12
Nodes (24): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+16 more)

### Community 18 - "cases.ts"
Cohesion: 0.11
Nodes (25): fetchAvailableActions(), fetchAvailableActionsWithGaps(), fetchCaseByNo(), fetchCaseEvents(), fetchCases(), fetchClarifications(), fetchStageActions(), fetchStageConfig() (+17 more)

### Community 19 - "api/masterData.ts"
Cohesion: 0.10
Nodes (21): BudgetHeadDraft, countLookupUsage(), createBudgetHead(), createLookup(), LookupDraft, tally(), unwrap(), updateBudgetHead() (+13 more)

### Community 20 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+15 more)

### Community 21 - "PortalLayout.tsx"
Cohesion: 0.12
Nodes (17): Logo(), LogoMark(), LogoMarkProps, LogoProps, ANSWER_LINES, CitationTrace(), PAGE_LINES, LandingFooter() (+9 more)

### Community 22 - "SideBySideView.tsx"
Cohesion: 0.14
Nodes (18): BlockRenderer(), markdownComponents, MarkdownViewer(), MarkdownViewerProps, VISUAL_META, BlockGrid(), readStoredOffset(), SideBySideView() (+10 more)

### Community 23 - "ProcurementHome.tsx"
Cohesion: 0.24
Nodes (18): CaseRegisterTable(), PortalLayout(), StageBadge(), useCases(), useLookups(), useStageConfig(), useStageCounts(), useWorklist() (+10 more)

### Community 24 - "TranslationMarkdown.tsx"
Cohesion: 0.15
Nodes (16): CollaboraEditor(), CollaboraEditorProps, edgeErrorMessage(), Alert, AlertDescription, AlertTitle, alertVariants, BuildHtmlOptions (+8 more)

### Community 25 - "CaseDocuments.tsx"
Cohesion: 0.18
Nodes (18): attachDocumentToCase(), CASE_DOCUMENT_TYPES, CaseDocument, detachCaseDocument(), fetchCaseDocuments(), signedDocumentUrl(), STAGE_DEFAULT_DOC_TYPE, fetchBidderDocuments() (+10 more)

### Community 26 - "embed"
Cohesion: 0.10
Nodes (17): chunkMarkdown(), corsHeaders, embedText(), requestSchema, safeSplitLong(), chunkText(), CONFIG, corsHeaders (+9 more)

### Community 27 - "ai.ts"
Cohesion: 0.17
Nodes (18): AiEndpoint, AiRole, baseUrlFor(), chat(), ChatMessage, ChatOptions, env(), getEmbedDimensions() (+10 more)

### Community 28 - "Application Logging System"
Cohesion: 0.09
Nodes (21): Access the Logs Page, Application Logging System, Basic Logging, Best Practices, Cleanup Old Logs, Database Schema, Edge Function Logging, Example Integration (+13 more)

### Community 29 - "ProcurementInsights.tsx"
Cohesion: 0.15
Nodes (16): AXIS_FONT, CategoryBars(), FlowChart(), MeterRow(), ChartPalette, DARK, LIGHT, useChartPalette() (+8 more)

### Community 30 - "chatCompletionText"
Cohesion: 0.13
Nodes (17): corsHeaders, requestSchema, corsHeaders, requestSchema, corsHeaders, requestSchema, chatCompletionText(), getTranslateModel() (+9 more)

### Community 31 - "ocr.ts"
Cohesion: 0.17
Nodes (17): corsHeaders, RequestBody, getChandraBaseUrl(), getOcrBackend(), getOcrMaxTokens(), getOcrModel(), getOcrModelName(), getOcrReasoningEffort() (+9 more)

### Community 32 - "DocumentManagement.tsx"
Cohesion: 0.12
Nodes (18): AudioVideoViewer(), WordEditorDialog(), FolderDialog(), MoveFolderDialog(), AssignTaxonomiesDialog(), TaxonomyManager(), PDFEditor(), RequestSignatureDialog() (+10 more)

### Community 33 - "api/commercial.ts"
Cohesion: 0.11
Nodes (18): fetchCommercialGaps(), fetchCommercialQuotes(), fetchCommercialRanking(), fetchCommercialRecord(), fetchLineComparison(), fetchReasonableness(), saveQuote(), setRankingBasis() (+10 more)

### Community 34 - "insights.ts"
Cohesion: 0.11
Nodes (15): fetchCaseActivity(), fetchMonthlyFlow(), CaseTimeline(), Entry(), gapBetween(), KIND_ICON, KIND_LABEL, stageWords() (+7 more)

### Community 35 - "GoodsReceiptPanel.tsx"
Cohesion: 0.16
Nodes (15): useGrnCloseGaps(), useGrnCycles(), useGrnForwardGaps(), useGrnLines(), useGrnSummary(), useLiveGoodsReceipt(), useSaveGrnLine(), grnCloseChecks() (+7 more)

### Community 36 - "extract-document-text/index.ts"
Cohesion: 0.15
Nodes (16): composePageText(), corsHeaders, extractTextFromImage(), extractTextFromPDF(), requestSchema, base64ToUint8(), decodeImageSource(), extractAndStorePdfImages() (+8 more)

### Community 37 - "main.py"
Cohesion: 0.16
Nodes (19): BaseModel, clamp_pixels(), crop_page_figures(), extract_images(), health(), image_to_data_uri(), ImagesRequest, ocr() (+11 more)

### Community 38 - "cst.ts"
Cohesion: 0.12
Nodes (19): approveCstAuthority(), fetchCommercialApprovals(), fetchCstGaps(), fetchCstScrutiny(), fetchCstVersions(), fetchLiveCstVersion(), fetchRecommendation(), fetchRecommendationHistory() (+11 more)

### Community 39 - "dependencies"
Cohesion: 0.11
Nodes (19): class-variance-authority, cmdk, jspdf, dependencies, class-variance-authority, cmdk, jspdf, @radix-ui/react-dropdown-menu (+11 more)

### Community 40 - "DGX Spark Handover"
Cohesion: 0.11
Nodes (18): 1. Status at a glance, 2. What the Spark changes, 3.1 Prerequisites, 3.2 Edit `docker/.env`, 3.3 Bring it up, 3.4 Migrations + users, 3.5 Verify, 3. Steps to run on the Spark (+10 more)

### Community 41 - "App.tsx"
Cohesion: 0.13
Nodes (14): App(), queryClient, ThemeProvider(), Toaster(), ToasterProps, Admin(), Analytics(), Auth() (+6 more)

### Community 42 - "compilerOptions"
Cohesion: 0.11
Nodes (17): ES2023, vite.config.ts, compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection (+9 more)

### Community 43 - "ProcurementSignIn.tsx"
Cohesion: 0.14
Nodes (16): ALL_QUEUES, PortalAction, PortalDef, portalHome(), PORTALS, QueueDef, QueueKey, REGISTER (+8 more)

### Community 44 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 45 - "seed-procurement.mjs"
Cohesion: 0.18
Nodes (15): ADMIN_GRANTS, BUDGET_HEADS, cfg(), createUser(), CURRENT_FY, fileEnv, insert(), insertWhenPresent() (+7 more)

### Community 46 - "Logger"
Cohesion: 0.23
Nodes (4): LogContext, LogEntry, Logger, LogLevel

### Community 47 - "devDependencies"
Cohesion: 0.13
Nodes (15): autoprefixer, eslint, eslint-plugin-react-refresh, devDependencies, autoprefixer, eslint, eslint-plugin-react-refresh, postcss (+7 more)

### Community 48 - "10. Testing"
Cohesion: 0.13
Nodes (15): 10.10 Price negotiation, 10.11 The purchase order, 10.12 Goods receipt, 10.13 Payment recommendation, 10.14 Master data, 10.1 Bring the stack up, 10.2 The accounts, 10.3 Automated checks (+7 more)

### Community 49 - "4. Stage by stage"
Cohesion: 0.13
Nodes (15): 4.10 The purchase order stage in detail, 4.11 The goods receipt stage in detail, 4.12 The payment recommendation stage in detail, 4.13 The activity timeline, 4.14 Asking about a case, 4.1 Every action, 4.2 What happens at each stage, 4.3 The requisition stage in detail (+7 more)

### Community 50 - "seed-users.mjs"
Cohesion: 0.21
Nodes (13): cfg(), createUser(), DEFAULT_USERS, fileEnv, grantRole(), hasRole(), listAllUsers(), main() (+5 more)

### Community 51 - "useAuth"
Cohesion: 0.16
Nodes (12): AppRole, AuthContext, AuthContextValue, AuthProvider(), EMPTY, ProcurementRole, useAuth(), PermissionGate() (+4 more)

### Community 52 - "MetadataTemplateManager.tsx"
Cohesion: 0.18
Nodes (12): MetadataField, MetadataTemplateManager(), MetadataTemplateManagerProps, Template, TemplateField, SignaturePad(), Checkbox, AppliedSignature (+4 more)

### Community 53 - "Assistant.tsx"
Cohesion: 0.19
Nodes (13): Command, CommandDialog(), CommandDialogProps, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList (+5 more)

### Community 54 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, bootstrap, build, build:dev, check:procurement, check:procurement:api, dev, gen:types (+6 more)

### Community 55 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 56 - "PncPanel.tsx"
Cohesion: 0.25
Nodes (13): useCloseNegotiationRound(), useNegotiation(), useNegotiationGaps(), useNegotiationRounds(), useOpenNegotiationRound(), useSaveNegotiationMandate(), useUpdateNegotiationRound(), negotiationChecks() (+5 more)

### Community 57 - "Procurement"
Cohesion: 0.15
Nodes (13): 11. Known limits, 1. What is built, and what is not, 2. Getting in, 3.1 The chain, 3.2 The way back, 3.3 Rejection, 3. The lifecycle, 6. Who can see a case (+5 more)

### Community 58 - "check-procurement-api.mjs"
Cohesion: 0.19
Nodes (10): api(), assert(), env, filed, [firstConsensus], H(), ok(), ROOT (+2 more)

### Community 59 - "purchaseOrder.ts"
Cohesion: 0.19
Nodes (11): amendPurchaseOrder(), fetchPoAiDraft(), fetchPoAmendments(), fetchPoGaps(), fetchPoLines(), fetchPurchaseOrder(), recordVendorAck(), savePurchaseOrder() (+3 more)

### Community 60 - "CstPanel.tsx"
Cohesion: 0.28
Nodes (12): useApproveCstAuthority(), useCommercialApprovals(), useCommercialRecommendation(), useCstGaps(), useCstScrutiny(), useCstVersions(), useLiveCstVersion(), useRecordRecommendation() (+4 more)

### Community 61 - "payment-ai-draft/index.ts"
Cohesion: 0.15
Nodes (7): corsHeaders, draftSchema, requestSchema, corsHeaders, draftSchema, requestSchema, getChatModel()

### Community 62 - "Spark Start Genie (EVIGSENSE)"
Cohesion: 0.17
Nodes (10): Architecture, Build, Chandra OCR on this machine (x86_64 CUDA), Development (Supabase CLI alternative), Embeddings (Qwen3-VL on vLLM), Environment variables, Model servers on a CUDA host (x86_64), Prerequisites (+2 more)

### Community 63 - "DocumentChat.tsx"
Cohesion: 0.24
Nodes (10): PDFViewerWithSearch(), textRenderer(), normalizeMathDelimiters(), Assistant(), DocumentChat(), excelCellToString(), Message, parseCsv() (+2 more)

### Community 64 - "TranslationHistory.tsx"
Cohesion: 0.26
Nodes (9): TranslationRecord, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader (+1 more)

### Community 65 - "form.tsx"
Cohesion: 0.23
Nodes (10): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+2 more)

### Community 66 - "goodsReceipt.ts"
Cohesion: 0.18
Nodes (11): fetchGoodsReceiptCycles(), fetchGrnCloseGaps(), fetchGrnForwardGaps(), fetchGrnLines(), fetchGrnSummary(), fetchLiveGoodsReceipt(), saveGrnLine(), unwrap() (+3 more)

### Community 67 - "wopi-host/index.ts"
Cohesion: 0.18
Nodes (5): convertHtmlToDocx(), corsHeaders, getCollaboraInternalUrl(), MarkdownRow, TokenRow

### Community 68 - "Translation Markdown Workflow"
Cohesion: 0.18
Nodes (10): Database, Error & loading states, Frontend modules, New edge functions, New page: `/translation-markdown`, Routes, Tech notes, Translation Markdown Workflow (+2 more)

### Community 69 - "chart.tsx"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 70 - "negotiation.ts"
Cohesion: 0.25
Nodes (10): closeNegotiationRound(), fetchNegotiation(), fetchNegotiationGaps(), fetchNegotiationRounds(), openNegotiationRound(), saveNegotiationMandate(), unwrap(), updateNegotiationRound() (+2 more)

### Community 71 - "supabase/types.ts"
Cohesion: 0.18
Nodes (10): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+2 more)

### Community 72 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, allowJs, noImplicitAny, noUnusedLocals, noUnusedParameters, paths, skipLibCheck, strictNullChecks (+2 more)

### Community 73 - "mermaidComponents.tsx"
Cohesion: 0.33
Nodes (7): mermaidComponents, loadMermaid(), looksLikeMermaid(), MermaidDiagram(), normalizeSource(), resolveColor(), themeVariables()

### Community 74 - "Dashboard.tsx"
Cohesion: 0.24
Nodes (8): Skeleton(), Dashboard(), dayLabel(), quickActions, RecentDoc, STATUS_COLORS, StatusSlice, TrendPoint

### Community 75 - "signatures.ts"
Cohesion: 0.20
Nodes (6): CaseSignature, fetchCaseSignatures(), fetchCaseSignaturesNamed(), NamedCaseSignature, SavedSignature, SignatureKind

### Community 76 - "Run the stack"
Cohesion: 0.22
Nodes (9): 1. Start LM Studio, 2. Start self-hosted Supabase, 3. Sign in with a seeded user, 4. Re-embed existing documents (after dim migration), 5. Start the frontend, Edge Functions read empty env vars (`supabaseUrl is required`, embedding/OCR fall back to defaults)?, `ingest-logs` returns 500 / `application_logs` table missing?, Run the stack (+1 more)

### Community 77 - "pagination.tsx"
Cohesion: 0.22
Nodes (8): ButtonProps, Pagination(), PaginationContent, PaginationEllipsis(), PaginationItem, PaginationLinkProps, PaginationNext(), PaginationPrevious()

### Community 78 - "lib/masterData.ts"
Cohesion: 0.22
Nodes (6): fetchLookups(), LookupKind, MASTER_DATA_CATEGORIES, MasterDataCategory, parseBulkEntries(), Lookup

### Community 79 - "payment.ts"
Cohesion: 0.25
Nodes (7): fetchPaymentAiDraft(), fetchPaymentGaps(), fetchPaymentRecommendation(), savePaymentRecommendation(), unwrap(), PaymentAiDraft, PaymentRecommendation

### Community 80 - "package.json"
Cohesion: 0.25
Nodes (7): allowScripts, canvas@3.2.3, core-js@3.46.0, name, private, type, version

### Community 81 - "bootstrap.ps1"
Cohesion: 0.46
Nodes (5): Get-AppliedVersions(), Initialize-Ledger(), Invoke-Migrations(), Invoke-Psql(), Set-BaselineIfAdopting()

### Community 82 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 83 - "navigation-menu.tsx"
Cohesion: 0.29
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 85 - "Jyoma AI (EVIGSENSE) — working notes"
Cohesion: 0.29
Nodes (6): Conventions, Jyoma AI (EVIGSENSE) — working notes, Layout, Model endpoints, Reference projects — read for behaviour, never for looks, Running it

### Community 86 - "toggle-group.tsx"
Cohesion: 0.43
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 87 - "generate-jwt-keys.mjs"
Cohesion: 0.40
Nodes (5): anonKey, base64UrlEncode(), genToken(), iat, serviceRoleKey

### Community 88 - "5. Roles, permissions and desks"
Cohesion: 0.33
Nodes (6): 5.1 The sixteen roles, 5.2 The twenty-six permissions, 5.3 Who holds what, 5.4 The twelve queues, 5.5 Which desk each role sits at, 5. Roles, permissions and desks

### Community 89 - "proposal.ts"
Cohesion: 0.40
Nodes (5): fetchProposal(), fetchProposalGaps(), saveProposal(), unwrap(), PurchaseProposal

### Community 90 - "extract-boq/index.ts"
Cohesion: 0.33
Nodes (3): corsHeaders, lineSchema, requestSchema

### Community 91 - "rag-assistant/index.ts"
Cohesion: 0.33
Nodes (4): AvailableImage, corsHeaders, ExtractedImage, requestSchema

### Community 92 - "Procurement"
Cohesion: 0.40
Nodes (5): A separate way in, Commands, Procurement, Roles, The stage engine lives in the database

### Community 93 - "Model servers on DGX Spark"
Cohesion: 0.40
Nodes (5): Before the first start, Image choice, Memory is the binding constraint, Model servers on DGX Spark, Start

### Community 94 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 95 - "usePdfTranslation.ts"
Cohesion: 0.50
Nodes (4): LanguageDirection, loadNotoSansFont(), PdfTranslationStats, usePdfTranslation()

### Community 96 - "useTranslation.ts"
Cohesion: 0.50
Nodes (4): excelPlainText(), LanguageDirection, TranslationStats, useTranslation()

### Community 97 - "process-large-document/index.ts"
Cohesion: 0.50
Nodes (3): corsHeaders, retryWithBackoff(), sleep()

### Community 98 - "7. The data model"
Cohesion: 0.50
Nodes (4): 7.1 Editing the master data, 7.2 Paperwork belongs to the case, not to the stage, 7.3 Signatures, 7. The data model

### Community 99 - "block"
Cohesion: 0.67
Nodes (3): block(), main(), Inclusive [start, end] for a ` key: {` block closed at the same indent.

### Community 100 - "auto-populate-metadata/index.ts"
Cohesion: 0.50
Nodes (3): corsHeaders, EnrichedMetadata, MetadataField

## Knowledge Gaps
- **629 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+624 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 764 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **99 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `RequisitionEditor.tsx`, `button.tsx`, `Documents.tsx`, `utils.ts`, `TaxonomyManager.tsx`, `TecPanel.tsx`, `PaymentPanel.tsx`, `formatMoney`, `sidebar.tsx`, `TenderPanel.tsx`, `useProcurement.ts`, `AppHeader.tsx`, `CommercialPanel.tsx`, `hooks/use-toast.ts`, `api/masterData.ts`, `PortalLayout.tsx`, `SideBySideView.tsx`, `ProcurementHome.tsx`, `TranslationMarkdown.tsx`, `CaseDocuments.tsx`, `DocumentManagement.tsx`, `GoodsReceiptPanel.tsx`, `App.tsx`, `useAuth`, `MetadataTemplateManager.tsx`, `Assistant.tsx`, `carousel.tsx`, `PncPanel.tsx`, `CstPanel.tsx`, `DocumentChat.tsx`, `TranslationHistory.tsx`, `form.tsx`, `chart.tsx`, `Dashboard.tsx`, `pagination.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `toggle-group.tsx`, `input-otp.tsx`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `supabase` connect `button.tsx` to `RequisitionEditor.tsx`, `Documents.tsx`, `utils.ts`, `TaxonomyManager.tsx`, `TecPanel.tsx`, `AppHeader.tsx`, `api/tender.ts`, `translationMarkdown.ts`, `cases.ts`, `api/masterData.ts`, `PortalLayout.tsx`, `TranslationMarkdown.tsx`, `CaseDocuments.tsx`, `DocumentManagement.tsx`, `api/commercial.ts`, `insights.ts`, `cst.ts`, `ProcurementSignIn.tsx`, `Logger`, `useAuth`, `MetadataTemplateManager.tsx`, `Assistant.tsx`, `purchaseOrder.ts`, `DocumentChat.tsx`, `TranslationHistory.tsx`, `goodsReceipt.ts`, `negotiation.ts`, `Dashboard.tsx`, `signatures.ts`, `lib/masterData.ts`, `payment.ts`, `vendors.ts`, `proposal.ts`, `usePdfTranslation.ts`, `useTranslation.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `Button` connect `button.tsx` to `RequisitionEditor.tsx`, `cn`, `Documents.tsx`, `utils.ts`, `TaxonomyManager.tsx`, `TecPanel.tsx`, `PaymentPanel.tsx`, `formatMoney`, `sidebar.tsx`, `TenderPanel.tsx`, `useProcurement.ts`, `AppHeader.tsx`, `CommercialPanel.tsx`, `PortalLayout.tsx`, `SideBySideView.tsx`, `ProcurementHome.tsx`, `TranslationMarkdown.tsx`, `CaseDocuments.tsx`, `ProcurementInsights.tsx`, `DocumentManagement.tsx`, `api/commercial.ts`, `GoodsReceiptPanel.tsx`, `App.tsx`, `ProcurementSignIn.tsx`, `MetadataTemplateManager.tsx`, `Assistant.tsx`, `carousel.tsx`, `PncPanel.tsx`, `CstPanel.tsx`, `DocumentChat.tsx`, `TranslationHistory.tsx`, `Dashboard.tsx`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _629 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RequisitionEditor.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06502732240437159 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.06313497822931785 - nodes in this community are weakly interconnected._
- **Should `button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12627450980392158 - nodes in this community are weakly interconnected._