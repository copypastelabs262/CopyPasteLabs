# ClassMind v4 — Full Issue Log (companion to the Product Walkthrough Audit)

Every verified finding as an [ISSUE] block. Generated 2026-09-06. 99 findings.


## Part 1 — Authentication & Onboarding (8)

[ISSUE] No faculty verification gate — any user can self-select Faculty and gain teaching privileges
- Location: src/app/choose-role/ChooseRoleForm.tsx:49-71; src/app/signin/page.tsx:138-155; src/app/api/profile/route.ts (POST role)
- What happened: On both onboarding surfaces the Faculty option is a plain button; selecting it POSTs {role:"faculty"} to /api/profile with no code, secret, or approval. A grep of src/ for a faculty code/verification/secret gate returns zero hits.
- What I expected: Faculty registration must require a private faculty-only verification password/code so students cannot self-provision Faculty accounts.
- Why this is a problem: Anyone who can sign up can grant themselves faculty privileges in one click — create courses, upload lectures, access the teaching console. This is the founder’s explicit Part-1 requirement and a genuine privilege/integrity gap. NOTE: the automated adversarial verifier wrongly rejected this finding; manual code inspection (grep + ChooseRoleForm.tsx:49-71) confirms no gate exists.
- Severity: Critical   |   Classification: MISSING
- Recommended direction: Gate the Faculty option behind a server-validated faculty code/secret entered at role selection (both /choose-role and the signup toggle); validate in /api/profile before writing role=faculty. Re-require it for any future role-upgrade path.
- Evidence: ChooseRoleForm.tsx:49-71 (bare Faculty button -> POST /api/profile); grep faculty-code/verification/secret = 0 hits

[ISSUE] Onboarding is a single role toggle — it captures no name for Google users and nothing else
- Location: src/app/choose-role/ChooseRoleForm.tsx:11-34
- What happened: The /choose-role step captures only role. It does not capture or confirm a name; for Google users the name relies entirely on user_metadata.full_name/name from Google (profile.ts:47), and if Google returns none the profile is created with full_name: null. There is no course-join, subject, or profile step.
- What I expected: The founder framed onboarding as capturing Name + role and asked whether this is 'a real onboarding step or just a role toggle'. It is just a role toggle.
- Why this is a problem: An email signup captures Full name (signin/page.tsx:137) but the Google/OAuth onboarding path has no name-capture fallback, so a Google account whose provider metadata lacks a name lands with a null name and no chance to supply one. Students also finish onboarding with no course enrolled, so their first authenticated screen is empty.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add a name field to /choose-role prefilled from metadata when present (and required when absent), and consider a first course-join / code-entry step so a student does not land on an empty state.
- Evidence: src/app/choose-role/ChooseRoleForm.tsx:13 (only role state); src/lib/profile.ts:47 (name taken solely from metadata); src/app/signin/page.tsx:137 (email path DOES capture name)

[ISSUE] A mis-picked role is permanent with no self-service recovery
- Location: src/app/api/profile/route.ts:64-68; src/app/choose-role/ChooseRoleForm.tsx (no re-entry)
- What happened: /api/profile refuses to change an existing role (409 'cannot be changed here') and there is no UI to request a change. A user who picks the wrong option — student who taps Faculty, or faculty who taps Student — is locked into it.
- What I expected: Immutability is a reasonable default, but a first-time user makes this choice with minimal context and needs a recovery path.
- Why this is a problem: The copy says 'pick carefully' but offers no undo. Absent the faculty gate this also means an accidental Faculty pick is a permanent privilege grant the user cannot revert, and a real faculty who fat-fingers Student cannot self-correct — both become support tickets.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Provide a supported role-change flow (with the faculty code re-required for upgrades to faculty), or at minimum a 'contact support / this is wrong' affordance on the immutability error.
- Evidence: src/app/api/profile/route.ts:64-68 (409 immutable); ChooseRoleForm.tsx:42-45 ('pick carefully' with no undo)

[ISSUE] New Google user is correctly routed to onboarding instead of the homepage
- Location: src/app/auth/callback/route.ts:69-80; src/app/choose-role/page.tsx:33-36
- What happened: After Google consent the callback exchanges the code, calls ensureProfile (insert-only), and when no role is on record redirects to /choose-role?next=... rather than dropping the user on /courses. ChooseRolePage re-checks and skips itself if a role already exists (replaying user_metadata.role), so existing users continue straight in and are never re-asked.
- What I expected: A new Google user must NOT be dumped on the homepage; they must pass through onboarding capturing role, and existing users continue straight in with roles never overwritten.
- Why this is a problem: This half of the founder's intent is met and the insert-only ensureProfile (profile.ts:45-49, 'keep' action in profile-role.ts:56) genuinely prevents a re-sign-in from overwriting a role. Worth recording as working so it is not accidentally regressed.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep. When the faculty gate is added, ensure the choose-role redirect still lands new Google users here first.
- Evidence: src/app/auth/callback/route.ts:74-76 (dest = ensured.role ? next : /choose-role); src/lib/profile-role.ts:47,56 ('keep' when hasProfile)

[ISSUE] Inline signup role toggle gives no explanation of faculty vs student, while /choose-role does — inconsistent and risky for an irreversible choice
- Location: src/app/signin/page.tsx:138-155 vs src/app/choose-role/ChooseRoleForm.tsx:49-71
- What happened: In signup mode the role picker is two bare buttons labelled 'faculty' and 'student' (signin/page.tsx:141-151) with only the label 'I am a' and zero description. The /choose-role page presents the same decision with a full explanation ('Are you teaching classes here, or attending them? This decides what your account can do, so pick carefully') plus per-option detail text.
- What I expected: The same account-defining, effectively irreversible decision should be explained consistently wherever it is made.
- Why this is a problem: The role is immutable after creation (api/profile/route.ts:64-68 rejects changes). A first-time email signer-upper picks a permanent, privilege-bearing role from two unlabeled words, while the OAuth path gets a careful explanation. The weaker surface is the one most likely to produce a mis-pick.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Give the inline signup toggle the same one-line-per-option descriptions and the 'pick carefully' framing used on /choose-role, or route all new signups through the richer /choose-role step rather than duplicating a thinner picker.
- Evidence: src/app/signin/page.tsx:143-151 (buttons render only {r}); src/app/choose-role/ChooseRoleForm.tsx:42-45,51-53 (explanatory copy)

[ISSUE] Role order and casing differ between the two pickers (faculty-first lowercase vs student-first capitalized)
- Location: src/app/signin/page.tsx:141; src/app/choose-role/ChooseRoleForm.tsx:50-53
- What happened: Signup toggle iterates ['faculty','student'] rendered lowercase via capitalize CSS, so Faculty is the LEFT/first option. /choose-role lists Student first, then Faculty, with proper-case titles.
- What I expected: Consistent ordering and capitalization for the same choice across the product.
- Why this is a problem: Faculty-first placement on the signup toggle subtly nudges toward the privileged role, and the inconsistent order/casing reads as unfinished. Combined with the missing faculty gate, defaulting the privileged option to the leftmost position is the wrong bias.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: List Student first everywhere (the common case), use consistent Title Case, and align both pickers to the same order.
- Evidence: src/app/signin/page.tsx:141 (['faculty','student']); src/app/choose-role/ChooseRoleForm.tsx:50-53 (student then faculty)

[ISSUE] Landing and header only ever say 'Sign in' — no 'Get started'/'Create account' entry for a first-time visitor
- Location: anon-landing--desktop.png (nav top-right 'Sign in' + hero 'Sign in' button); anon-signin--desktop.png (nav still shows 'Sign in')
- What happened: The landing page's only two CTAs are both labelled 'Sign in' (top-right nav and the hero button). A brand-new user must click 'Sign in', then notice the small 'No account? Create one' link at the bottom of the form (signin/page.tsx:174-181) to reach signup. On the signin page itself the top-right nav still shows 'Sign in', linking to the page already open.
- What I expected: A product courting first-time faculty and students should invite account creation from the landing page, and the header link should not point to the current page.
- Why this is a problem: 'Sign in' is the returning-user verb; a first-time visitor sees no 'Get started' and may assume the product is invite-only or that they lack an account. The redundant header 'Sign in' on the signin page is dead navigation.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Make the landing hero CTA 'Get started' (routing to signup mode) and keep a secondary 'Sign in'. Hide or relabel the header auth link when already on /signin.
- Evidence: anon-landing--desktop.png (both CTAs 'Sign in'); anon-signin--desktop.png (redundant top-right 'Sign in'); src/app/signin/page.tsx:174-181 (Create one buried under the form)

[ISSUE] Landing step-03 copy is grammatically garbled
- Location: anon-landing--desktop.png (step 03 'The lecturer confirms what matters')
- What happened: The body reads: 'Only the things students must act on wait for a human. Teaching goes live on its own.' The first sentence parses awkwardly ('...must act on wait for a human') and the second is cryptic.
- What I expected: First-impression marketing copy should read cleanly on the first pass.
- Why this is a problem: This is the above-the-fold explanation of the product's core human-in-the-loop step; a stumble here undercuts trust on the exact screen meant to build it.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Rewrite, e.g. 'Only the items students must act on wait for faculty approval. Everything else is published automatically.'
- Evidence: anon-landing--desktop.png step 03 body text

## Part 2 — Homepage (7)

[ISSUE] On tablet and mobile, 'Your courses' is pushed to the very bottom, after the entire to-do feed
- Location: src/app/_components/StudentHome.tsx:216-355 (grid: main col-span-8 first, courses col-span-4 second)
- What happened: The courses list is the right rail on desktop (lg:col-span-4) but because it comes after the main column in source, it stacks LAST on tablet/mobile — below to-dos, 'Pick up where you left off', and 'Recently added'.
- What I expected: A student who opens the app to go into a specific course should reach their course list without scrolling past the entire dashboard.
- Why this is a problem: On mobile 'Your courses' appears near the ~3200px mark, after five other blocks. Navigating to a course — a core action — requires scrolling the whole feed, even though the top nav also has a 'Courses' link. The rail's placement is optimised for the desktop two-column layout only.
- Severity: Medium   |   Classification: UX IMPROVEMENT
- Recommended direction: On small viewports, order 'Your courses' directly after the Ask hero (before the to-do/recency sections), or rely on the top-nav 'Courses' link and drop the redundant rail on mobile.
- Evidence: stu-home--mobile.png and stu-home--tablet.png both show 'Your courses' as the last content block, after 'Recently added'; on stu-home--desktop.png it is the top-right rail. Source 

[ISSUE] Homepage leads with a to-do dashboard framing, not Ask — the intended focal element is second
- Location: src/app/_components/StudentHome.tsx:212 (PageHeader title="Catch up"), subtitle at :80-87
- What happened: The first thing rendered is a tiny mono greeting 'GOOD EVENING, TEST' followed by a large H1 'Catch up' and the subtitle '2 things to do across 3 courses.' The Ask composer is the SECOND block down. The page's opening statement is a task count, not an invitation to ask.
- What I expected: Per the intended direction, the homepage should read within seconds as 'ask something': a simple greeting plus the global Ask as the focal first element, with minimal noise.
- Why this is a problem: The H1 'Catch up' plus a to-do tally frames the entire screen as a homework dashboard. A first-time user's eye lands on 'Catch up / 2 things to do' before it ever reaches the composer, so the product's actual promise (ask across all your classes) is demoted to a supporting card. The greeting the direction asks for is buried in an 11px uppercase eyebrow while a command word takes the H1.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Make Ask the hero. Either promote the composer into the H1 zone (greeting + 'Ask across all your classes' + the input), or at minimum change the page title away from 'Catch up'/to-do-count framing to a neutral greeting so the composer is the first thing that reads as the point of the page.
- Evidence: stu-home-fold--desktop.png (H1 'Catch up' + '2 things to do across 3 courses' dominates the top; Ask hero sits below it). StudentHome.tsx:212, subtitle logic :83-84 returns 'N thin

[ISSUE] 'Pick up where you left off' and 'Recently added' add two more dashboard sections below the fold
- Location: src/app/_components/StudentHome.tsx:276-331
- What happened: Below the to-do list the page stacks a 'Pick up where you left off' list (6 saved-conversation rows in the seeded state) and a 'Recently added' lecture list, each its own titled Section with descriptions and 'Showing 2 of 3' footers.
- What I expected: A minimal Ask-first home would not carry two additional scrolling list sections; these are recency dashboards.
- Why this is a problem: Combined with the to-do list and course rail, the page becomes four stacked dashboard sections. On desktop the content runs to ~1900px of scroll; on mobile the page is ~3674px tall (stu-home--mobile.png). 'Pick up where you left off' is genuinely on-brand for a product 'growing a memory,' but at 6 rows plus the to-do stack it turns the home into a feed, defeating the stated 'minimal visual noise' goal.
- Severity: Low   |   Classification: UNNECESSARY
- Recommended direction: Keep at most ONE recency affordance and cap it tightly. 'Pick up where you left off' is the more defensible one (it feeds back into Ask); trim it to ~3 rows and drop 'Recently added' from the home, or move both behind the Courses view. Let the composer, not lists, be what the page is.
- Evidence: stu-home--desktop.png: 'Pick up where you left off' (6 rows) then 'Recently added' (2 rows, 'Showing 2 of 3'). StudentHome.tsx:277 and :294. Mobile total height ~3674px per stu-hom

[ISSUE] Desktop right rail leaves a large empty column under 'Your courses'
- Location: src/app/_components/StudentHome.tsx:334-355
- What happened: On desktop the right rail holds only the 'Your courses' card (three short rows, ending ~700px down) while the left column continues to ~1900px. The remaining ~1200px of the right column is blank.
- What I expected: A two-column layout should either balance content or not reserve a half-width column that sits empty for most of the scroll.
- Why this is a problem: The empty rail makes the page feel unfinished and wastes the horizontal space the two-column grid was chosen for. It also visually strands the to-do cards in a narrower-than-necessary left column while half the viewport is dead.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: If the dashboard sections are trimmed as recommended, this resolves itself. Otherwise move a light element (courses summary or a compact 'pick up' list) into the rail to balance it, or collapse to a single centered column so the composer stays the visual center.
- Evidence: stu-home--desktop.png: 'Your courses' card ends around the 'Test2 Cloud Computing' row while the left column runs through 'Recently added'; the right side below the card is empty.

[ISSUE] Ask hero carries a long marketing paragraph a returning student re-reads every visit
- Location: src/app/_components/StudentHome.tsx:128-132
- What happened: Under the H2 the hero prints a three-line explainer: 'One place for every subject you're in — assignments, deadlines, what a lecture covered. Every answer is grounded in what was actually recorded, and says which subject it came from.'
- What I expected: The composer's purpose should be legible from the label, placeholder and 'All subjects' pill; a persistent paragraph is onboarding copy, not daily-use copy.
- Why this is a problem: For the home a student opens repeatedly, this paragraph is fixed noise that pushes the actual input further down and adds reading weight to the one surface that should feel instant. It reads as a landing-page pitch on a signed-in home.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Drop or shorten the explainer to a single short line, or show it only on first visit / when the student has no conversations yet.
- Evidence: stu-home-fold--desktop.png shows the full three-line paragraph between 'Ask across all your classes.' and the input. StudentHome.tsx:128-132.

[ISSUE] The composer works and its cost-safety design is sound
- Location: src/app/_components/StudentHome.tsx:89-108, 116-187
- What happened: The global Ask composer renders as a real search-shaped input with leading magnifier, an always-solid primary 'Ask' button, and a scope pill; submitting routes to /ask carrying the question via a consumed-once sessionStorage key rather than the URL, so no visit/refresh/crafted-link triggers a paid call.
- What I expected: An Ask-first home whose primary control is unmistakably usable and does not spend money on load.
- Why this is a problem: Not a problem — worth noting as genuinely well done given the codebase's central cost constraint. The composer is above the fold on desktop, the empty-state variant correctly swaps to 'Join a course to start asking', and nothing is billed until an explicit submit.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Preserve this composer and its sessionStorage-carry pattern exactly; the recommended changes are about elevating it, not altering its behavior.
- Evidence: stu-home-fold--desktop.png (solid blue 'Ask' button, magnifier, 'All subjects' pill). StudentHome.tsx:95-102 (sessionStorage carry, no ask on load), :178-185 (join-first empty stat

[ISSUE] A course with '0 lectures' is shown as a tappable row, leading a student into an empty course
- Location: src/app/_components/StudentHome.tsx:452-474 (StudentCourseRow); route.ts:188 (student lectureCount = published only)
- What happened: 'Your courses' lists 'CC101 Cloud Computing — Term 7 · 0 lectures' as a normal clickable row identical to courses that have content.
- What I expected: A row that says 0 lectures should either signal there is nothing to open yet or not invite a tap that lands on an empty page.
- Why this is a problem: For a student, lectureCount is the count of what they can actually open (route.ts:188), so '0 lectures' means the course view will be empty. The row gives no hint of that, so tapping it is a dead end — a small but real 'why did nothing happen' moment on the primary navigation list.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Add a subtle 'nothing published yet' treatment (muted style or inline note) for zero-lecture courses so the row sets expectations before the tap.
- Evidence: stu-home--desktop.png 'Your courses' shows 'CC101 Cloud Computing / Term 7 · 0 lectures' as an ordinary chevron row. route.ts:188 sets student lectureCount to published count.

## Part 3 — Global Ask (10)

[ISSUE] Previous conversations are hidden in a top-right "Recent" dropdown, not a left sidebar
- Location: src/app/_components/AskWorkspace.tsx:418-455
- What happened: On /ask, the only way to see prior conversations is a small "Recent" ghost button in the top-right of the conversation bar. Clicking it opens a 288px popover that floats over the conversation content (in stu-global-ask-recent--desktop.png it visibly overlaps the student's own question bubble, clipping it to "...o I have?"). There is no persistent list of conversations anywhere on the page.
- What I expected: The intended model is a persistent AI workspace with previous conversations in a vertical LEFT SIDEBAR, always visible, so switching threads is a single glance-and-click. A sidebar is also where the ~600px of empty left gutter on desktop should go.
- Why this is a problem: This is the central deviation from the intended design. A transient dropdown makes conversation history feel like a minor menu rather than the backbone of a workspace; it hides the product's newest and most differentiating capability (persistence). Users don't discover that threads persist, and the popover-over-content collision looks broken. Meanwhile the desktop layout wastes the exact space a sidebar would occupy.
- Severity: High   |   Classification: MISSING
- Recommended direction: Promote conversations to a permanent left rail on desktop (collapsible to the dropdown on mobile/tablet). Use the empty left gutter that already exists. Keep the dropdown only as the narrow-viewport fallback.
- Evidence: stu-global-ask-recent--desktop.png (dropdown overlapping question bubble); AskWorkspace.tsx:418-455 (Recent popover implementation); no sidebar element in the component tree.

[ISSUE] Huge dead space on desktop: content trapped in a narrow left-of-center column
- Location: stu-global-ask-new--desktop.png; src/app/_components/AskWorkspace.tsx:410,610
- What happened: On a 1440px desktop viewport the intro ("Your academic context, in one place") sits in a ~640px block, the composer floats around 60% down the page, and there is a large empty band between the composer and the footer, plus wide empty gutters left and right. In the answered state (stu-global-ask--desktop.png) the answer text occupies roughly the left 55% and the entire right half is empty.
- What I expected: A workspace should fill its frame — either a two-pane layout (conversation list + thread) or a centered, balanced reading column with the composer anchored to the bottom edge, not stranded mid-page above empty space.
- Why this is a problem: The screen reads as unfinished and under-populated. The vertical centering of the empty intro (justify-center) leaves the composer mid-viewport with nothing beneath it, which looks like a rendering bug rather than a deliberate empty state.
- Severity: Medium   |   Classification: UX IMPROVEMENT
- Recommended direction: Introduce the left conversation rail (fixes both this and the finding above), and/or anchor the composer to the true bottom of the viewport so the empty intro's whitespace sits above it, not below it.
- Evidence: stu-global-ask-new--desktop.png (composer mid-page, empty band below); stu-global-ask--desktop.png (empty right half); AskWorkspace.tsx:474 flex justify-center on empty state.

[ISSUE] Asking the same question from home spawns duplicate conversations
- Location: src/app/_components/AskWorkspace.tsx:232; src/app/_components/StudentHome.tsx:89-102
- What happened: Every question carried in from the home hero starts a FRESH thread (carriedQuestion forces target=null, bypassing auto-resume). The Recent dropdown in stu-global-ask-recent--desktop.png shows two separate "What do I need to work on" conversations, both "2 hours ago" — near-duplicate threads created by asking the same thing twice from home.
- What I expected: Repeating a question, or returning to Ask, should either resume my existing thread or at least not silently litter my history with identical-titled duplicates.
- Why this is a problem: The conversation list is the product's memory. If it fills with duplicate titles the student cannot tell threads apart, and there is no way to clean them up (see next finding). This actively degrades the persistence feature it is meant to showcase.
- Severity: Medium   |   Classification: BROKEN
- Recommended direction: Either resume the most recent global thread from the home hero instead of always forcing a new one, or de-duplicate by title/recency, or give the home composer a "new vs continue" choice. At minimum add thread management so duplicates can be removed.
- Evidence: stu-global-ask-recent--desktop.png (two "What do I need to work on · 2 hours ago"); AskWorkspace.tsx:232; StudentHome.tsx:89-102 (askGlobal always router.push('/ask') with carried 

[ISSUE] No way to rename, delete, or manage conversations
- Location: src/app/_components/AskWorkspace.tsx:433-451
- What happened: The Recent list renders each conversation as a plain button with an auto-title and a timestamp. There is no rename, no delete, no archive — nothing but open.
- What I expected: A persistent workspace lets me tidy my history: delete a throwaway thread, rename an auto-titled one.
- Why this is a problem: Combined with the duplicate-creation issue, the history is append-only and will only grow messier. Auto-titles like "What do I need to work on" are not distinctive; without rename the list becomes unnavigable over a term.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add per-conversation actions (delete at minimum, rename ideally) via a hover affordance or context menu in the list.
- Evidence: AskWorkspace.tsx:433-451 (list item is open-only, no controls).

[ISSUE] Heading and framing on /ask differ from the home Ask hero for the same feature
- Location: src/app/ask/page.tsx:24-27; src/app/_components/StudentHome.tsx:120-127
- What happened: Home hero: eyebrow "ask classmind", an "All subjects" pill, heading "Ask across all your classes." The /ask destination: eyebrow "ASK", no pill, heading "Your academic context, in one place." A student who clicks the home hero lands on a page whose title, eyebrow, and description are all worded differently.
- What I expected: The same feature should announce itself consistently across its entry point and its destination, so the transition feels continuous rather than like arriving somewhere new.
- Why this is a problem: Inconsistent naming makes the two surfaces feel like different features. "Your academic context, in one place" is also vaguer and less action-oriented than the home's "Ask across all your classes."
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Align the /ask heading, eyebrow, and the "All subjects" cue with the home hero (or vice versa). Pick one voice for Global Ask.
- Evidence: ask/page.tsx:24-27 vs StudentHome.tsx:120-127.

[ISSUE] Global Ask has no persistent entry point in the top navigation
- Location: src/app/layout.tsx:79-88
- What happened: The signed-in header contains only a "Courses" link and the user menu. There is no "Ask" item. Global /ask is reachable only from the home hero or by clicking a recent-thread link; the wordmark returns to /courses, not to an Ask surface.
- What I expected: For the flagship student feature, I expected a persistent "Ask" affordance in the global nav so I can reach it from anywhere.
- Why this is a problem: Once a student navigates into Courses or a lecture, there is no obvious way back to Global Ask except returning to the home hero. The product's headline capability is only one click away from exactly one screen.
- Severity: Low   |   Classification: MISSING
- Recommended direction: Add an "Ask" link to the main nav in layout.tsx alongside "Courses".
- Evidence: layout.tsx:79-88 (nav contains only Courses + UserMenu); no /ask link anywhere in the header.

[ISSUE] The active-conversation title is a small mono "chip" that reads as a tag, not a heading
- Location: src/app/_components/AskWorkspace.tsx:414-416
- What happened: The current thread's title appears top-left as a tiny monospace, boxed chip ("What assignments do I have") — the same visual treatment as a code token. It is easy to mistake for a label or breadcrumb rather than the title of the conversation you're in.
- What I expected: The conversation you're currently reading should have a clear, human-weight title, distinct from UI chrome.
- Why this is a problem: The mono chip styling under-communicates that this is your thread's name; paired with the far-right Recent/New controls, the top bar's information hierarchy is unclear at a glance.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Render the active title in normal (non-mono) type at a slightly larger size; reserve the chip-mono style for genuine tokens.
- Evidence: AskWorkspace.tsx:414-416 (className chip-mono text-[12px] on the title); visible in stu-global-ask--desktop.png top-left.

[ISSUE] Suggestion prompts are inconsistent across the three Ask surfaces
- Location: src/app/ask/page.tsx:29-34; src/app/_components/AskPanel.tsx:58-63; src/app/_components/StudentHome.tsx (GLOBAL_PROMPTS)
- What happened: Global /ask offers "Do I have anything to do?", "What assignments do I have?", "What topics were covered?", "What should I work on first?" The course/lecture AskPanel offers a different set ("What was taught?", "What assignment was given?", "Was there a deadline?", "What did I miss?"), and the home hero uses yet another list.
- What I expected: Consistent, or intentionally scoped, starter prompts so the vocabulary feels like one product.
- Why this is a problem: Minor, but the shifting example questions make the surfaces feel authored by different hands. Not wrong per scope, just unharmonized.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Define one prompt vocabulary and derive per-scope variants from it deliberately.
- Evidence: ask/page.tsx:29-34 vs AskPanel.tsx:58-63.

[ISSUE] Direct-answer provenance chip and collapsed "From your subjects" grouping work well
- Location: src/app/_components/AskWorkspace.tsx:515-522; src/app/_components/AskPanel.tsx:356-361
- What happened: The answered state shows a calm "Answered straight from the stored lecture knowledge." chip, then groups the answer by subject ("Test2 · Cloud Computing", "Test1 · Robotics & Automation") with numbered citations, and collapses sources behind "FROM YOUR SUBJECTS · 2". It reads cleanly and the cross-subject grouping delivers on the global-scope promise.
- What I expected: An answer that makes clear where it came from and which subject each item belongs to.
- Why this is a problem: Not a problem — noting genuinely good execution of the global-scope provenance model, which is the hard part of this feature.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep. This is the strongest part of the surface.
- Evidence: stu-global-ask--desktop.png (grouped answer + provenance chip + collapsed sources); AskWorkspace.tsx:515-522; AskPanel.tsx:356-361 (sourcesHeading derives "From your subjects" from

[ISSUE] Empty-state Ask button renders faint/secondary, reading as disabled at first glance
- Location: src/app/_components/AskWorkspace.tsx:572-579
- What happened: On the fresh /ask intro (stu-global-ask-new--desktop.png) the input is focused with a bright accent border but the adjacent "Ask" button is the low-contrast secondary tone (it only becomes a solid primary once text is typed). Contrast this with the home hero, whose "Ask" button is always solid primary (StudentHome.tsx:157).
- What I expected: The primary action on the flagship surface reads as clearly actionable, or the difference from the home hero is intentional and consistent.
- Why this is a problem: A faint button next to a glowing input is momentarily ambiguous between "disabled" and "broken," and it is inconsistent with the home hero which keeps Ask solid. The in-code rationale (avoid a half-faded primary) is defensible, but the divergence from the home surface undercuts it.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Make the empty-state treatment consistent between the home hero and /ask. If secondary-until-typed is the chosen pattern, apply it in both places.
- Evidence: stu-global-ask-new--desktop.png (faint Ask button beside focused input); AskWorkspace.tsx:572-579 vs StudentHome.tsx:157 (always tone="primary").

## Part 4 — Lecture Ask (6)

[ISSUE] Scope contradiction: placeholder says 'this lecture', the fine print under it says 'this class's lectures'
- Location: AskWorkspace.tsx:559-561 (placeholder) vs AskWorkspace.tsx:586-588 (caption); stu-lecture-chat--desktop.png
- What happened: On the lecture page the input placeholder reads 'Ask anything about this lecture', but the caption directly beneath it reads 'Answers come only from what was said in this class's lectures.' The caption's non-global branch is hardcoded to 'this class's lectures' and never accounts for lectureId, so lecture scope inherits the course-scope wording.
- What I expected: One consistent statement of scope. If the ask is limited to THIS lecture (it is — the request sends lectureId, AskWorkspace.tsx:324, and the list endpoint filters by lectureId, AskWorkspace.tsx:150-151), both the placeholder and the caption should say 'this lecture'.
- Why this is a problem: The two lines directly contradict each other about the single most important fact of this surface — what the AI can see. A student cannot tell whether asking here searches only this recording or the whole course. The caption actively misinforms: it tells the user the lecture chat is course-wide when it is not.
- Severity: Medium   |   Classification: BROKEN
- Recommended direction: Add a lectureId branch to the caption (e.g. 'Answers come only from what was said in this lecture...'), matching the placeholder and the actual scope.
- Evidence: AskWorkspace.tsx:586-588 always emits 'this class's lectures' for the non-global path; AskWorkspace.tsx:559-561 emits 'Ask anything about this lecture'; visible in stu-lecture-chat

[ISSUE] The chat thread has no bottom edge — it bleeds straight into 'What was taught' and 'Full lecture' document sections
- Location: stu-lecture-chat--desktop.png; LectureClient.tsx:487-547; AskWorkspace.tsx:539-541 (sticky composer)
- What happened: The lecture page renders a live multi-turn conversation with a composer that is position:sticky at the bottom, and then continues below it in the SAME scroll with a 'What was taught' disclosure and a 'Full lecture' audio/transcript section. In the desktop capture the composer ('Ask anything about this lecture' + fine print) is followed by empty space and then two more full-width page sections. There is no visual cont
- What I expected: A chat surface should own its region unambiguously — the composer is the floor of the conversation, and anything below it should read as clearly separate, or the chat should be the whole scroll (as it is on the course Ask tab and global /ask).
- Why this is a problem: A sticky composer with more document below it is a known confusing pattern: the composer stays pinned while you scroll, then suddenly un-pins and 'What was taught' slides up over it. A first-time user cannot tell whether the page is a chat or a document. This is precisely the 'reading page with a search widget' hybrid the code comment (LectureClient.tsx:34-36) claims to have moved away from — but the knowledge and tr
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Either give the conversation a clearly bounded card/panel so its end is visible, or make the lecture Ask a distinct tab (mirroring the course 'Ask' tab) so the chat is a full surface and 'What was taught'/'Full lecture' live on a separate 'Lecture' view. At minimum, add a strong section divider/heading immediately belo
- Evidence: stu-lecture-chat--desktop.png shows composer at ~y1365 then blank space then 'What was taught' at ~y1631 and 'Full lecture' at ~y1751 in the same scroll; LectureClient.tsx:492-547 

[ISSUE] The conversation region has no heading on the lecture page — only the composer footnote identifies it as Ask
- Location: AskWorkspace.tsx:491-531 (turns render with no heading); stu-lecture-chat--desktop.png / --tablet.png
- What happened: When the conversation has turns, the surface renders only a thin conversation bar (a monospace title chip + Recent/New) and then the messages. There is no 'Ask' section title the way 'What was taught' and 'Full lecture' below it each get a bold heading. On the lecture page the chat therefore appears directly under the lecture meta line with no label.
- What I expected: Every major region on this page is titled ('What was taught', 'Full lecture'); the conversation — the surface the redesign calls THE page — should be titled too, so its start is as legible as the sections below it.
- Why this is a problem: Inconsistent information architecture: two of three regions are labeled, the most important one is not. This is a direct contributor to the 'where does the chat begin and end' confusion.
- Severity: Low   |   Classification: MISSING
- Recommended direction: Give the conversation a section heading/eyebrow on the lecture page (e.g. 'Ask this lecture'), matching the Section headers used for knowledge and transcript.
- Evidence: AskWorkspace.tsx:491-531 renders the <ol> of turns with only the conversation bar (413-463) above it and no heading; contrast LectureClient.tsx:517 ('What was taught') and 553 ('Fu

[ISSUE] Mobile: composer placeholder is clipped to 'Ask anything about this lectun'
- Location: stu-lecture-chat--mobile.png; AskWorkspace.tsx:551-571 (input flex-1 beside Ask button)
- What happened: On the 390px viewport the input sits next to the 'Ask' button and the placeholder text is cut off mid-word — 'Ask anything about this lectun' instead of '...this lecture'.
- What I expected: Placeholder text should fit or truncate gracefully, not sever a word so it reads as a typo.
- Why this is a problem: A half-word placeholder looks like a bug/typo and undermines polish on the primary input of the surface.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Shorten the mobile placeholder (e.g. 'Ask about this lecture') or stack the button below the input on narrow widths so the placeholder has room.
- Evidence: stu-lecture-chat--mobile.png shows 'Ask anything about this lectun' next to the 'Ask' button.

[ISSUE] Conversation title rendered as a monospace 'code chip' reads as a technical token, not a saved question
- Location: AskWorkspace.tsx:414 (chip-mono on the title); stu-lecture-chat--desktop.png / --mobile.png
- What happened: The active conversation's title is shown in a monospace, chip-mono style at the top-left of the conversation bar — e.g. 'What assignment did sir give us' rendered in a code-like typeface.
- What I expected: A human sentence used as a conversation title should read as prose, not as a code identifier.
- Why this is a problem: Monospacing a natural-language title makes it look like a debug label or ID rather than 'your previous question', slightly obscuring that this is a resumable conversation. Minor but it undercuts the friendly chat framing.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Render the conversation title in the normal UI font (reserve chip-mono for genuinely code/label content).
- Evidence: AskWorkspace.tsx:414 applies className including 'chip-mono' to the conversation title <p>; the monospace title chip is visible top-left of the conversation bar in stu-lecture-chat

[ISSUE] WORKING: Lecture Ask reuses the same chat component/interface as course and global Ask, correctly scoped to the lecture
- Location: AskWorkspace.tsx:98-119, 148-151, 324; LectureClient.tsx:492-509
- What happened: The lecture page mounts the same AskWorkspace used for the course 'Ask' tab and global /ask, passing lectureId. The ask request includes lectureId (AskWorkspace.tsx:324) and the Recent list endpoint filters conversations by lectureId (AskWorkspace.tsx:150-151), so prior LECTURE conversations are accessible via the same Recent/New controls seen elsewhere, and citations seek the on-page player via nav.onSeek (LectureCl
- What I expected: A single consistent chat interface across the three scopes, with the lecture scope genuinely limited to this recording and prior lecture threads reachable.
- Why this is a problem: Not a problem — this is the correct, consistent behavior and worth confirming: the interface is one component, not a divergent one-off, and scope isolation is enforced server-side per the endpoints selected here.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep. The remaining issues are framing/boundary/copy, not the underlying chat model.
- Evidence: AskWorkspace.tsx:148-151 selects lecture-scoped endpoints; :324 sends lectureId; LectureClient.tsx:493-508 passes lectureId, nav, and lecture-specific intro/suggestions into the sh

## Part 5 — Navigation (8)

[ISSUE] User menu is a dead end — no Profile, Settings, Home, or Assignments; only account info + Sign out
- Location: src/app/_components/SignOutButton.tsx:113-144; stu-usermenu--desktop.png
- What happened: I clicked my name/avatar ("T Test") in the top-right, the single obvious 'my account' control. The dropdown showed only three static lines of account info (name, email, role) and one action: 'Sign out'. There is no Profile, no Settings, no Home, no Assignments, no Help — nothing actionable except leaving.
- What I expected: The account menu is where a first-time user goes to manage themselves: edit profile, change settings, maybe jump Home or to Assignments. The intended direction was a menu exposing Home, My Courses, Assignments, Profile, Settings, Sign out.
- Why this is a problem: The one menu users instinctively open to 'find where the account stuff lives' answers 'there is none.' A backend endpoint src/app/api/profile/route.ts exists but no profile page and no link to it exist anywhere in the UI (grep for 'Profile'/'Settings' in _components returns nothing) — so profile editing is built server-side but unreachable. The menu reads as unfinished.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add at least Profile and Settings entries (wire the existing /api/profile). If those pages are genuinely out of scope, still add a Home entry so the menu isn't a one-item dropdown. Menu structure verified at SignOutButton.tsx:122-142.
- Evidence: stu-usermenu--desktop.png shows the open dropdown containing only 'Test student / student.test@classmind.local / Student' and 'Sign out'. SignOutButton.tsx:130-142 renders exactly 

[ISSUE] Inside a course on mobile/tablet, there is NO back link and NO course switcher — the rail is desktop-only
- Location: src/app/_components/shell/ClassShell.tsx:262 (aside 'hidden lg:block'); stu-course-robotics--mobile.png
- What happened: On the mobile course view, the left rail is gone entirely. That rail is the only place the '← All classes' back link (ClassShell.tsx:146-151) and the course-switcher list (ClassShell.tsx:159-160) live. On mobile I saw only the course header and the four tabs (Home/Ask/Lectures/Assignments) — no back button, no way to switch to another course.
- What I expected: A back mechanism and course switcher on every viewport — especially mobile, where 'where am I / how do I get back' matters most.
- Why this is a problem: The shell's own comment (ClassShell.tsx:22-23) claims it keeps 'where am I answered even three levels deep,' but that guarantee is desktop-only. On mobile the sole escape from a course is the top-bar wordmark or 'Courses' link — the explicit '← All classes' affordance the design provides simply doesn't render. Switching courses on mobile requires backing all the way out to the home list. The primary in-product naviga
- Severity: Medium   |   Classification: BROKEN
- Recommended direction: Surface the '← All classes' back link and a course switcher on mobile — e.g. a compact back link above the header and a course-picker dropdown, both outside the 'hidden lg:block' aside. Do not gate the only back affordance behind lg.
- Evidence: ClassShell.tsx:262 `<aside className="hidden lg:block">` wraps ClassRail, which contains both the back link (line 146) and RailGroup switcher. stu-course-robotics--mobile.png shows

[ISSUE] Two entirely different nav paradigms: global shell (thin top bar) vs class shell (rail + tabs) vs global Ask (no chrome at all)
- Location: src/app/layout.tsx:80-88; src/app/_components/shell/ClassShell.tsx:202-233; stu-home--desktop.png / stu-course-robotics--desktop.png / stu-global-ask--desktop.png
- What happened: Three screens, three navigation models. Home/dashboard: only a top bar ('Courses' + user menu). Inside a course: left course-rail + a four-item tab bar (Home/Ask/Lectures/Assignments). Global Ask (/ask): neither — no rail, no tabs, just the top bar plus a 'Recent / + New' conversation strip. The GLOBAL Ask and the in-course Ask are the same feature but present with completely different chrome.
- What I expected: A consistent navigational spine so the same feature (Ask) and the same 'where am I' cues carry across scopes.
- Why this is a problem: Entering a course swaps the entire nav model, and opening global Ask strips it again. A first-time user re-learns 'how do I move around here' on each surface. The GLOBAL vs COURSE Ask discrepancy is especially jarring: course Ask sits under a tab bar with a rail, global Ask floats alone with no sense of place. It reads as three products stapled together.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Give /ask at least a lightweight 'All subjects' context header consistent with the class header, and reconcile the two shells so the top-level scopes (global / subject / lecture) feel like one system rather than three chrome styles.
- Evidence: layout.tsx:80-88 (global top nav), ClassShell.tsx:202-233 (tabs) + 142-165 (rail), ask/page.tsx renders outside ClassShell (ClassContext.tsx:47-49 notes /ask is the 'ONE surface th

[ISSUE] Global Ask (/ask) has no persistent nav entry and no in-course path — you must return to the dashboard to ask across subjects
- Location: src/app/_components/StudentHome.tsx:102 (router.push('/ask')); src/app/ask/page.tsx; stu-global-ask--desktop.png
- What happened: The only way to reach GLOBAL Ask is by submitting a question from the home dashboard's Ask panel (StudentHome.tsx:102) or opening a saved global conversation. There is no 'Ask' link in the top bar and none inside a course. grep for a global /ask link found only that one programmatic push — no <Link href="/ask">.
- What I expected: If 'Ask across all your subjects' is a headline feature (it's the hero card on the home page), I expected a standing way to get to it from anywhere — a top-nav 'Ask' item, or at least a link from inside a course.
- Why this is a problem: A student sitting inside a course who wants to ask across all subjects has no direct route: they must navigate Courses → home → scroll to the Ask panel → type. The product's flagship GLOBAL scope is the least reachable of the three Ask scopes. The feature is effectively hidden behind the dashboard.
- Severity: Low   |   Classification: MISSING
- Recommended direction: Add a persistent 'Ask' entry to the top nav (or a route to /ask) so global Ask is reachable from any screen, mirroring how each course exposes its own Ask tab.
- Evidence: StudentHome.tsx:102 is the sole navigation to /ask; grep for href="/ask" across src/app/**/*.tsx returned no matches. layout.tsx:80-88 top nav contains only 'Courses' + UserMenu — 

[ISSUE] Naming inconsistency: 'Courses' vs 'classes' vs 'Teaching/Enrolled' for the same concept
- Location: src/app/layout.tsx:85 ('Courses'); src/app/_components/shell/ClassShell.tsx:150 ('← All classes'), 159 ('Teaching'); stu-course-robotics--desktop.png
- What happened: The same concept is labeled inconsistently across the nav: the top bar says 'Courses' (layout.tsx:85), the home section says 'Your courses', but the in-course back link says '← All classes' (ClassShell.tsx:150) and the rail groups say 'Teaching' / 'Enrolled'. The shell's code comments also call them 'classes' throughout.
- What I expected: One word for one concept — either 'courses' or 'classes' — used everywhere in navigation.
- Why this is a problem: A first-time user clicking '← All classes' lands on a page headed 'Your courses' reached via a nav item called 'Courses.' The vocabulary shift makes the user pause to confirm these are the same list. Small, but it's exactly the kind of friction that erodes trust that the app is coherent.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Pick one term (the top nav and page header already agree on 'Courses') and change '← All classes' to '← All courses'. Align rail/labels to match.
- Evidence: layout.tsx:85 'Courses'; ClassShell.tsx:150 '&larr; All classes'; ClassShell.tsx:159 label 'Teaching'. stu-course-robotics--desktop.png shows '← All classes' above a page for a 'co

[ISSUE] Wordmark and 'Courses' link are redundant (both go to /courses), and neither is labeled 'Home'
- Location: src/app/layout.tsx:69-77 (wordmark → /courses) and 81-86 ('Courses' → /courses)
- What happened: When signed in, clicking the 'ClassMind' wordmark navigates to /courses (layout.tsx:70), and the adjacent 'Courses' nav link also navigates to /courses (layout.tsx:82). Two side-by-side controls in the same header resolve to the identical destination.
- What I expected: Either a single 'home' affordance, or two controls with distinct destinations. Typically the wordmark = home, and other nav items go elsewhere.
- Why this is a problem: There is no 'Home' concept in the nav — the dashboard is reached by a link named 'Courses' (which for faculty actually renders 'Your lectures', fac-home--desktop.png). A first-time user doesn't know that 'Courses' is the home screen, and the duplicate wordmark link adds no new destination. The header carries two controls where one distinct one would do.
- Severity: Low   |   Classification: UNNECESSARY
- Recommended direction: Keep the wordmark as the home link and either rename the nav 'Courses' to 'Home', or drop it and spend the slot on a real second destination (Ask, or Assignments). For faculty, 'Courses' mislabels a lecture-centric home.
- Evidence: layout.tsx:70 `href={user ? "/courses" : "/"}` and layout.tsx:82 `href="/courses"` — both to /courses. fac-home--desktop.png shows /courses rendering as 'Your lectures' with an Upl

[ISSUE] No global Assignments destination despite the home 'What you have to do' spanning all courses
- Location: src/app/courses/[id]/assignments (per-course only); stu-home--desktop.png; stu-global-ask--desktop.png
- What happened: Assignments exist only per-course (route src/app/courses/[id]/assignments; the 'Assignments' tab in ClassShell.tsx TABS). There is no cross-course assignments page or nav item, even though the home dashboard has a 'What you have to do' band aggregating assignments across every course, and global Ask can answer 'What assignments do I have' (stu-global-ask--desktop.png).
- What I expected: A single 'Assignments' destination showing everything due across courses — the intended nav included global Assignments.
- Why this is a problem: The data is clearly aggregated (the home band and the global-Ask answer both list assignments from multiple courses), but there's no persistent nav entry to a consolidated assignments view. A student who wants 'all my assignments' must either scroll the dashboard band or ask a chatbot the same question every time. The aggregate view exists as content but not as a navigable place.
- Severity: Low   |   Classification: MISSING
- Recommended direction: Either add a global 'Assignments' nav destination backed by the same aggregation the home band already uses, or make the home 'What you have to do' heading a link to a full list. Avoid forcing users through global Ask for a structured query.
- Evidence: ClassShell.tsx:29-34 TABS includes Assignments only within a course base path. No top-level /assignments route (find for dir 'assignments' returned only courses/[id]/assignments). 

[ISSUE] In-course tab bar keeps a persistent 'Ask' and clear active state — the class shell nav is genuinely good
- Location: src/app/_components/shell/ClassShell.tsx:202-233; stu-lectures--desktop.png, stu-course-robotics--desktop.png
- What happened: Inside a course, the four-tab bar (Home/Ask/Lectures/Assignments) shows a clear underlined active state, the rail highlights the current course, and 'Lectures' correctly stays lit on the lecture detail subtree (ClassShell.tsx:212 startsWith logic). Switching tabs costs no refetch (ClassContext shares one course fetch).
- What I expected: Clear 'where am I', an obvious active tab, and a visible course context header.
- Why this is a problem: Not a problem — noting it because it's the one place the navigation model is coherent and self-locating, and it's the pattern the global shell and /ask should be brought up to.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Use the class shell as the reference model: extend its context-header + active-state clarity to the global shell and the /ask surface.
- Evidence: stu-lectures--desktop.png shows 'Lectures' tab underlined/active with the rail highlighting 'Robotics & Automation TEST1'. ClassShell.tsx:210-212 active logic; ClassContext.tsx:6-1

## Part 6 — Course Experience (8)

[ISSUE] Course Home tab is a composite of the Assignments and Lectures tabs — the same content, rendered a third time
- Location: src/app/_components/shell/ClassHome.tsx:123-166; stu-course-robotics--desktop.png
- What happened: The student Home tab renders exactly two bands: 'What you have to do' (ClassHome.tsx:123-140), which maps the identical AssignmentCard component over the same owed items, and 'Activity' (ClassHome.tsx:143-166), a chronological list of every lecture linking to its detail page. The Assignments tab (ClassAssignments.tsx:93-120) renders that same AssignmentCard for the same confirmed items under the same heading 'What yo
- What I expected: A course landing that either does a distinct job (a launcher / at-a-glance summary) or is dropped in favour of making Ask, Lectures, and Assignments the primary destinations. A default tab should not be a re-render of the two tabs beside it.
- Why this is a problem: For a student, Home has no unique content. It duplicates the Assignments tab's card verbatim (same component, same full evidence dump — not a preview) and duplicates the Lectures tab's list. The user lands on redundancy, and the four-tab bar implies four things to do when there are really three (Ask, Lectures, Assignments) plus a mirror. This is wasted attention and makes the IA feel padded.
- Severity: Medium   |   Classification: UNNECESSARY
- Recommended direction: Decide what Home is FOR. Strongest option: make Ask the course landing (it is the product's core value and is currently buried behind a redundant dashboard). If a Home is kept, it must earn its place — e.g. a lean launcher (one line: N lectures, N assignments due, a prominent Ask box) that summarises and links, never r
- Evidence: ClassHome.tsx:6 imports the same AssignmentCard used in ClassAssignments.tsx:100; ClassHome.tsx:135 renders owed.slice(0,2) with showLecture, ClassAssignments.tsx:99-102 renders th

[ISSUE] Two enrolled courses both titled 'Cloud Computing' are distinguishable only by an arbitrary code (CC101 vs TEST2)
- Location: src/app/_components/shell/ClassShell.tsx:109-140 (RailGroup), :182-192 (header); stu-course-robotics--desktop.png (rail), stu-course-cc101--desktop.png
- What happened: The Enrolled rail lists two rows both reading 'Cloud Computing', separated only by a small mono code beneath — 'CC101' and 'TEST2' (ClassShell.tsx:129-130). Both courses are Term 7 (stu-course-cc101--desktop.png header reads 'Term 7'; the TEST2 course in stu-subject-ask--desktop.png also reads 'Term 7'). The header uses the code as its eyebrow (ClassShell.tsx:184), so once inside, the only thing telling the two apart
- What I expected: Two courses with the same title to be disambiguated by something a human recognises — instructor name, section, or term — not by a system code the student never chose and cannot interpret.
- Why this is a problem: A student with two same-named courses cannot tell which rail row is which without knowing what 'CC101' vs 'TEST2' means. Codes are join/system identifiers, not human labels (one here is literally 'TEST2'). Clicking the wrong one lands you in a course whose header also only differs by that same opaque code. Real universities routinely run multiple sections of one course, so this collision is not a test-data artifact —
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: When two courses in the rail share a title, surface a distinguishing human attribute (instructor, section, or term) inline. More broadly, reconsider leading with the raw code as the header eyebrow for students — the code is meaningful to faculty (it is the join key) but noise to a student.
- Evidence: ClassShell.tsx:129 renders {c.title} (truncated) with :130 {c.code} beneath; stu-course-robotics--desktop.png rail shows two 'Cloud Computing' rows with codes CC101 and TEST2; both

[ISSUE] 'What you have to do' is used as a heading on both Home and Assignments, for the same cards
- Location: src/app/_components/shell/ClassHome.tsx:125 and src/app/_components/shell/ClassAssignments.tsx:96; stu-course-robotics--desktop.png, stu-assignments--desktop.png
- What happened: The student sees the heading 'What you have to do' on the Home tab (ClassHome.tsx:125) and again as the heading on the Assignments tab (ClassAssignments.tsx:96), each followed by the same AssignmentCard. The two only differ by a subtitle: Home has none, Assignments adds 'Everything set across this class, with the moment it was said.'
- What I expected: One canonical home for 'what you have to do'. If the Assignments tab owns that phrase and content, Home should not repeat both the phrase and the card.
- Why this is a problem: The repeated heading makes the two tabs feel like the same screen reached two ways, reinforcing the redundancy above. A user who clicks Assignments after reading Home sees the identical heading and identical card and reasonably wonders whether they navigated at all.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Reserve 'What you have to do' for the Assignments tab (its true home). If Home retains any assignment reference, give it a distinct framing that clearly points elsewhere (e.g. 'Due soon →') rather than re-using the same heading and full card.
- Evidence: ClassHome.tsx:125 title="What you have to do"; ClassAssignments.tsx:96 title="What you have to do"; both render AssignmentCard (ClassHome.tsx:135, ClassAssignments.tsx:100).

[ISSUE] First impression of a course is dominated by one giant assignment card; the class activity is pushed below the fold
- Location: src/app/_components/shell/ClassHome.tsx:123-166; stu-course-robotics-fold--desktop.png
- What happened: The above-the-fold capture (stu-course-robotics-fold--desktop.png) shows the header, tabs, 'What you have to do', and the top of the assignment card — the card runs steps 1-4, a NOT SPECIFIED block, and seven 'From the lecture' timestamped quotes (visible in full at stu-course-robotics--desktop.png), so it consumes roughly the whole viewport. The 'Activity' band — the class's actual event stream — only begins far bel
- What I expected: The default landing to give a first-time user a scannable overview, with the primary action (Ask) and a sense of what happened in the class visible early — not one assignment's full evidence trail filling the screen.
- Why this is a problem: AssignmentCard on Home is the full card, not a preview — it renders the complete evidence quote list. One assignment therefore buries everything else. A student opening the course to ask a question or check what was taught meets a wall of one assignment's derivation quotes first.
- Severity: Medium   |   Classification: UX IMPROVEMENT
- Recommended direction: If Home survives at all, cap what each assignment shows on it to a summary (title, source lecture, step count) and move the evidence quotes to the Assignments/lecture pages where they belong. Better: land students on Ask so the first screen is the product's core action, not an assignment's transcript.
- Evidence: stu-course-robotics-fold--desktop.png shows the assignment card filling the fold; ClassHome.tsx:135 renders AssignmentCard (full, with evidence) rather than a compact preview; the 

[ISSUE] Home 'Activity' list and the Lectures tab list are the same rows to the same destinations
- Location: src/app/_components/shell/ClassHome.tsx:143-166 (StreamRow) vs src/app/_components/StudentCourseView.tsx:57-104; stu-course-robotics--desktop.png, stu-lectures--desktop.png
- What happened: Home's 'Activity' section lists every lecture newest-first, each row linking to /courses/{id}/lectures/{id} (ClassHome.tsx:160-161, 187-192). The Lectures tab lists the same lectures linking to the same detail pages (StudentCourseView.tsx:71-99). In the robotics course both show the single row 'Robotics and Automation trial' → the same lecture. The only difference is Home decorates the row with a status pill and a yi
- What I expected: Lecture activity to live in one place. A student does not need two lists of the same lectures pointing at the same pages.
- Why this is a problem: It is a second duplication on the very same Home screen — Home = (Assignments card) + (Lectures list). The 'Activity' framing promises something richer than the Lectures tab but delivers the same navigable set, so it reads as filler that pushes the actual content further down.
- Severity: Low   |   Classification: UNNECESSARY
- Recommended direction: Pick one home for the lecture stream. If Lectures is that home, drop the Activity list from student Home (or reduce it to a single 'Latest lecture' pointer). The yield metadata ('N topics captured') could enrich the Lectures tab rows instead of justifying a duplicate list.
- Evidence: ClassHome.tsx:187-192 links to lectures/{id}; StudentCourseView.tsx:72-73 links to the same lectures/{id}; stu-course-robotics--desktop.png Activity row and stu-lectures--desktop.p

[ISSUE] The class rail disappears on mobile with no replacement course switcher
- Location: src/app/_components/shell/ClassShell.tsx:262 (aside 'hidden lg:block'); stu-course-robotics--mobile.png
- What happened: The left rail ('← All classes', ENROLLED, the course list) is wrapped in an aside with class 'hidden lg:block' (ClassShell.tsx:262), so below the lg breakpoint it is not rendered. The mobile robotics capture (stu-course-robotics--mobile.png) shows no rail and no in-page way to switch to another class — only the top-nav 'Courses' link remains.
- What I expected: On mobile, some affordance to move between my enrolled classes without a full round-trip back to the Courses index — or at least a visible 'All classes' link where the rail used to be.
- Why this is a problem: A student enrolled in several classes (the demo user has three) loses the quick class-to-class switch on phones, which is where much student use happens. The '← All classes' escape hatch is also inside the hidden rail, so on mobile it too vanishes; the only way out is the top 'Courses' link, which is less obviously the same thing.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Provide a mobile course switcher — e.g. a dropdown on the course header, or surface '← All classes' outside the hidden aside so the escape hatch survives at all widths.
- Evidence: ClassShell.tsx:262 aside className includes 'hidden lg:block'; the rail contents (ClassRail, ClassShell.tsx:142-165) live only inside that aside; stu-course-robotics--mobile.png sh

[ISSUE] Empty course shows an honest, well-written empty state instead of a broken or blank screen
- Location: src/app/_components/shell/ClassHome.tsx:147-156; stu-course-cc101--desktop.png
- What happened: For the empty Cloud Computing (CC101) course, Home suppresses the 'What you have to do' band (owed is empty, ClassHome.tsx:123) and renders only 'Activity' with a clear empty state: 'Nothing has happened in this class yet. When your lecturer uploads a recording, what it covered will appear here.' (ClassHome.tsx:151-155). The copy is role-aware (student vs owner variants).
- What I expected: A newly-empty course to explain itself rather than showing a blank panel or an error.
- Why this is a problem: Not a problem — this is the right behaviour and worth noting as a baseline the rest of the course surfaces should match. Note the prompt framed CC101 as 'a course whose only lecture failed'; what the student actually sees is the generic empty state, because failed lectures are filtered out of the student payload (ClassHome.tsx:181 comment: 'Students never see these rows at all'). So a failed-only course reads to the 
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep the empty state. Separately, consider whether a student in a course where processing has repeatedly failed deserves any softer signal than 'Nothing has happened' — likely no (failures are faculty's problem), but worth a deliberate decision rather than a side effect of the filter.
- Evidence: ClassHome.tsx:147-156 EmptyState with student/owner copy; ClassHome.tsx:180-182 comment confirms students never see problem-status rows; stu-course-cc101--desktop.png shows the emp

[ISSUE] Subject-scope Ask is a genuinely strong, well-scoped conversation surface
- Location: src/app/courses/[id]/ask/page.tsx; stu-subject-ask--desktop.png
- What happened: The Cloud Computing (TEST2) Ask tab shows a real threaded conversation with the student's turns right-aligned, answers with inline citation superscripts, collapsible 'From the lecture · N' source rows per answer, a conversation switcher ('Cache scaling' / Recent / + New), and a pinned composer reading 'Ask anything about this class' with the scope contract stated plainly beneath: 'Answers come only from what was said
- What I expected: A clear, single-purpose asking surface scoped to the course, with citations and saved history.
- Why this is a problem: Not a problem — this is the product's core value delivered cleanly, and it is where the redundant Home tab should arguably be sending students first. The scope disclaimer and saved-conversation affordance are exactly right. Noted as the standout surface in this area.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Treat this as the anchor of the course experience. Consider making it the default course landing; the other tabs (Lectures, Assignments) are references, but Ask is the reason to open a course.
- Evidence: stu-subject-ask--desktop.png shows the full conversation, citations, 'From the lecture · N' rows, conversation switcher, and the scoped composer with its disclaimer; ask/page.tsx r

## Part 7 — Faculty Experience (9)

[ISSUE] Faculty 'Recent lectures' pulls from courses they are only enrolled in as a student, contradicting its own 'every course you teach' label and surfacing 403 link
- Location: src/app/api/me/overview/route.ts:125-131,379-383; src/app/_components/TeacherHome.tsx:205; fac-home--desktop.png
- What happened: The 'Recent lectures' section is described as 'The latest across every course you teach.' but the payload's recentLectures is lectures.slice() over ALL courses — owned AND enrolled (route.ts:100-105 builds courseIds from owned+enrolled; the lectures query at :130 filters .in('course_id', courseIds)). The screenshot shows two 'Robotics and Automation trial · Test1' rows here, and Test1 is the course the faculty is enr
- What I expected: 'Every course you teach' should list only taught courses. And I should never be shown a failed/unpublished lecture from a course where I am merely a student, let alone a link to it.
- Why this is a problem: The label is factually wrong, and the failed Test1 row is a link to /courses/{id}/lectures/{id} which 403s for a non-owner on a non-ready lecture (lectures/[id]/route.ts:35). So the faculty home advertises an internal failure state from a course they don't teach and hands the user a link that returns 'This lecture is not published yet.' It is both a data-scope bug and a broken link.
- Severity: High   |   Classification: BROKEN
- Recommended direction: Scope faculty recentLectures (and processingCount) to owned courses only, matching the 'courses you teach' contract; the enrolled-as-student course belongs in a separate student-style surface, not the teaching feed.
- Evidence: route.ts:379 recentLectures = lectures.slice(...) over owned+enrolled courseIds; TeacherHome.tsx:205 description 'every course you teach'; lectures/[id]/route.ts:35 returns 403 for

[ISSUE] Faculty home is purely operational — an upload/triage console with no teaching intelligence
- Location: src/app/_components/TeacherHome.tsx:94-299; fac-home--desktop.png
- What happened: Faculty home offers exactly three things: 'Upload lecture', a 'Needs your attention' review queue, and a 'Recent lectures' processing feed, plus a courses rail. There is no lecture planning, no prep help, no 'what have I covered', no course-level question surface, no material generation — nothing that treats the teacher as a user of the AI rather than a feeder of audio into it.
- What I expected: Per founder direction, a faculty workspace that helps me teach: understand prior coverage, plan the next lecture, generate material, see class insight.
- Why this is a problem: This is the core strategic gap. The product's whole intelligence layer is pointed at students; faculty get a pipeline-operations panel. It works, but it positions faculty as an ingestion mechanism, which is precisely the outcome the founder wants to avoid.
- Severity: High   |   Classification: FUTURE PRODUCT OPPORTUNITY
- Recommended direction: Introduce a faculty AI workspace (even a single Ask-over-my-courses surface to start), then grow toward planning/prep/material generation. The retrieval brain already exists; it just isn't offered to faculty.
- Evidence: TeacherHome.tsx renders only PageHeader + 'Needs your attention' + 'Recent lectures' + courses rail; no Ask, planning, or generation affordance anywhere in the file. fac-home--desk

[ISSUE] Faculty have no global Ask entry point anywhere in the app chrome
- Location: fac-home--desktop.png (top nav); src/app/_components/shell/ClassShell.tsx nav / global header
- What happened: The faculty top navigation contains only 'Courses' and the account dropdown. Faculty home ('Your lectures') is a pure upload/review dashboard. Nothing in the persistent chrome links to any Ask surface. /ask exists and is reachable by typing the URL, but nothing in the faculty experience points to it.
- What I expected: As a faculty member I expected a way to ask ClassMind something — 'what did I cover in CC101 last term', 'draft me a recap' — from the home or the global nav, the way a student clearly can.
- Why this is a problem: The founder direction is explicit: faculty should NOT be a mere uploader/admin; they should have their own AI workspace. Today the only cross-course intelligence the product built (global Ask) is invisible to faculty. A teacher never discovers the single most differentiating capability unless they guess a URL.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add a faculty-facing Ask entry point in the global nav and/or on faculty home, pointed at a faculty-scoped Ask (their taught courses), with teaching-oriented framing and prompts.
- Evidence: fac-home--desktop.png shows nav = 'Courses' + 'Test' only, no Ask. Grep of src/app/_components for /ask nav links: only ClassShell.tsx:31 (course tab) and StudentHome.tsx router.pu

[ISSUE] The only global Ask (/ask) is student-framed, so a faculty member who reaches it lands in a screen written for someone else
- Location: src/app/ask/page.tsx:24-34; fac-global-ask--desktop.png
- What happened: Reaching /ask as faculty shows the same student page: heading 'Your academic context, in one place', body 'Ask across every subject you're in — assignments, deadlines, what was taught, what to work on', suggestion chips 'Do I have anything to do?', 'What assignments do I have?', 'What should I work on first?', and composer 'Answers come only from what was recorded in your subjects' lectures.'
- What I expected: If faculty can reach a global Ask, it should speak to a teacher: coverage, prep, prior lectures, class insight — not 'what should I work on first?' as if the teacher were a student with homework.
- Why this is a problem: Every word on this page assumes the reader is a student with assignments and deadlines. For a teacher it is not just unhelpful, it is disorienting — it implies the product does not know who they are. This is the exact 'faculty as afterthought' failure the founder direction warns against.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Branch /ask (or add a faculty variant) by role: for faculty, retitle and reseed the suggestions toward teaching ('What have I covered in CC101 so far?', 'Summarise my last lecture', 'What did students most ask about?').
- Evidence: src/app/ask/page.tsx:26-34 hardcodes student intro/suggestions with no role branch; StudentAskPage is the only /ask route. fac-global-ask--desktop.png shows the student copy verbat

[ISSUE] Faculty 'Your courses' rail mixes taught courses and a course they joined as a student in one undifferentiated list
- Location: src/app/_components/TeacherHome.tsx:268-296,305-314; fac-home--desktop.png
- What happened: The home rail lists QA-BROWSER (Teaching), CC101 (Teaching) and Test1 (Student · Robotics & Automation) together under one heading 'Your courses', distinguished only by a small 'Teaching' vs 'Student' word in the meta line. The dedicated course page rail does this better — it splits into 'TEACHING' and 'ENROLLED' groups (ClassShell.tsx:159; fac-course-cc101--desktop.png).
- What I expected: On the home, taught courses and a course I attend as a student are different contexts and should be visually separated, as they already are inside the course shell.
- Why this is a problem: Putting a course I'm a student in alongside the ones I teach — with the teaching join-code chips right next to it — blurs which hat I'm wearing, and it's inconsistent with the app's own course-shell grouping ('TEACHING'/'ENROLLED'). A first-time faculty user reads three 'my courses' and has to squint at a one-word meta to tell that one is fundamentally different.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Group the home rail into 'Teaching' and 'Enrolled' like the course shell already does, or drop enrolled courses from the teaching home entirely.
- Evidence: TeacherHome.tsx:307 meta = course.isOwner ? 'Teaching' : 'Student' in a single flat list; ClassShell.tsx:159 already renders a separate 'Teaching' RailGroup; fac-home--desktop.png 

[ISSUE] Faculty cannot create or post an assignment; assignments only ever arrive via lecture reconstruction
- Location: src/app/_components/shell/ClassAssignments.tsx:50; fac-assignments--desktop.png
- What happened: The Assignments tab empty state reads 'Nothing has been set in this class yet. When a lecture sets work, it is reconstructed from the recording and lands here for your confirmation — you never have to type it in.' There is no 'Add assignment' affordance anywhere on the tab. The only path to an assignment is: record a lecture that happens to mention work, then confirm the reconstructed item.
- What I expected: A teacher who wants to set an assignment that wasn't spoken in a lecture (a reading, a project brief) to be able to add it.
- Why this is a problem: 'You never have to type it in' is a nice promise, but it silently forecloses the common case of a teacher deliberately setting work outside a recording. The feature is framed as a convenience while actually being the only mechanism, which limits faculty agency and reinforces the uploader-only role.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Offer an explicit 'Add assignment' action alongside the reconstruction flow, so reconstruction is the assist, not the sole channel.
- Evidence: ClassAssignments.tsx:50 isOwner branch renders only the reconstruction-only empty state; fac-assignments--desktop.png shows no create affordance.

[ISSUE] Course-level Ask tab (the only Ask faculty can reach) is framed for students, not the teacher who owns the course
- Location: src/app/courses/[id]/ask/page.tsx:11; src/app/_components/AskWorkspace.tsx:613-618; fac-course-cc101--desktop.png (Ask tab)
- What happened: Inside a course a faculty member owns, the Ask tab renders AskWorkspace with no role-aware intro, so it falls back to the default hero 'Ask this class anything' / 'Every answer is built only from what was actually said in the lectures, cited down to the second it was said — so you can hear it for yourself.' This is the same surface a student sees; nothing acknowledges that the reader is the person who taught the lect
- What I expected: When I open Ask on a course I teach, prompts and framing oriented to teaching ('What have I covered so far?', 'Where did I leave off?', 'What was thin?').
- Why this is a problem: This IS the single Ask entry point faculty actually have, and it speaks to them as a student querying someone else's class. It's usable, but it wastes the one place the product could make a teacher feel the AI is theirs.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Pass an isOwner-aware intro/suggestions into the course Ask workspace so the teacher's own class Ask reads as teaching support.
- Evidence: courses/[id]/ask/page.tsx renders <AskWorkspace /> with no intro/suggestions; AskWorkspace.tsx:613-618 default copy is student-voiced ('so you can hear it for yourself'); the Ask t

[ISSUE] On mobile, the lecture status pill drops below the descriptive text in Recent lectures, so status reads last
- Location: src/app/_components/TeacherHome.tsx:216-244; fac-home--mobile.png
- What happened: Recent-lecture rows use flex-col on mobile with the status pill span placed after the content span, so on phones the 'Published'/'Failed' pill appears at the bottom-left of each row, underneath the note text ('What was taught is live...'), rather than adjacent to the title. On desktop the same pill sits top-right where it scans immediately.
- What I expected: Status is the fastest thing I scan for on a processing feed; it should read near the title on every viewport.
- Why this is a problem: On mobile the reader parses title, meta, pipeline track, and a full sentence before learning the lecture failed. Status arriving last inverts the scan order on the exact viewport where scanning matters most.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Move the status pill so it sits beside/under the title on mobile (before the note), e.g. render it inside the title block rather than as the trailing flex child.
- Evidence: TeacherHome.tsx:219 row is flex-col until sm; the StatusPill span is the last child (:239-243); fac-home--mobile.png shows 'Published'/'Failed' pills below the note text of each re

[ISSUE] Upload primary action resolves intelligently to the user's actual next step
- Location: src/app/_components/CoursesClient.tsx:363-386; fac-home--desktop.png
- What happened: The single 'Upload lecture' CTA branches: one owned course links straight into it, multiple owned courses opens a 'Which course?' picker, and zero owned courses becomes 'Create your first course'. The header carries exactly one primary action rather than a row of equal buttons.
- What I expected: A clear single next action that doesn't make me choose among five buttons.
- Why this is a problem: Not a problem — this is genuinely good IA: one dominant action per screen, resolved to the step the user is actually missing, honest about the fact that a lecture lives inside a course.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep. Worth preserving as the pattern when a faculty Ask/workspace entry point is added — don't dilute the single-primary-action discipline.
- Evidence: CoursesClient.tsx:363-386 uploadAction() branches on owned.length; fac-home--desktop.png shows the single 'Upload lecture' primary button (owner has 2 courses, so it opens the pick

## Part 8 — Faculty Recording / Upload (10)

[ISSUE] Awaiting-upload lecture page promises a transcript that does not exist
- Location: screenshot fac-lecture-pending--desktop.png ("Full lecture" section)
- What happened: The pending lecture "Lecture 1 - The cloud control layer" is in the Awaiting upload state: the banner says "This lecture has no recording yet / The upload never finished, so there is nothing to process." Directly below, the "Full lecture" section reads: "The recording is not available right now. The transcript below is complete, and every timestamp still jumps to the right line." There is no transcript below — nothin
- What I expected: For a lecture with no audio and no transcript, the Full lecture section should say there is nothing yet, or not render at all.
- Why this is a problem: The copy directly contradicts the state banner six lines above it and points at content that is not on the page. It appears to be transcript-fallback copy (meant for a processed lecture whose audio is temporarily unavailable) leaking into the empty/awaiting state. A faculty member reading "the transcript below is complete" will scroll looking for a transcript that will never be there.
- Severity: High   |   Classification: BROKEN
- Recommended direction: Gate the "Full lecture"/transcript-fallback block on the lecture actually having a transcript. In the awaiting-upload state, either omit the section or show a single "No recording or transcript yet" line.
- Evidence: fac-lecture-pending--desktop.png: banner "This lecture has no recording yet" vs. Full lecture text "The transcript below is complete"

[ISSUE] Failed lecture: home card and lecture detail page give contradictory causes and fixes for the same failure
- Location: screenshots fac-home--desktop.png / fac-course-qa--desktop.png (home/course cards) vs. fac-lecture-failed--desktop.png (detail); src/app/_components/LectureUpload.tsx:75-87 FAILURE
- What happened: For CC Lec1 the home "Needs your attention" card and the CC101 course Home card both explain: "Transcription is paused — the transcription service has run out of credits... it can be transcribed once credits are restored." But the lecture detail page (fac-lecture-failed) for the same lecture says "This recording could not be processed / The recording never got as far as a transcript" and its "What to do" list is: pla
- What I expected: The same failure should be described and remediated consistently across surfaces.
- Why this is a problem: The two surfaces diagnose different root causes (billing/credits vs. bad audio/wrong language) for one lecture. A faculty member who read the home card knows the recording is fine and it is a credit problem, then the detail page tells them to re-record a clearer copy and change the language — wasted effort that cannot fix an out-of-credits failure. The primary detail-page CTA "Upload this lecture again" is also the w
- Severity: High   |   Classification: CONFUSING
- Recommended direction: Drive both surfaces from the same failure kind. For the credits/authorize failure, the detail page should show the credits explanation and a "retry once credits are restored" affordance, not audio-quality troubleshooting. Reserve "Upload again / check audible / change language" for the failure kinds where they actually
- Evidence: fac-lecture-failed--desktop.png "What to do" list vs. fac-home--desktop.png credits copy; LectureUpload.tsx:84-92

[ISSUE] Primary "Upload lecture" CTA lands on the course Home tab, which has no upload control
- Location: src/app/_components/CoursesClient.tsx:366 (href={`/courses/${owned[0].id}`}); screenshots fac-home--desktop.png, fac-course-qa--desktop.png, fac-lectures--desktop.png
- What happened: On the faculty home the one big blue primary action is "Upload lecture". With a single owned course it links to `/courses/{id}` with no tab fragment, which renders the course Home tab (fac-course-qa--desktop.png) — an Activity feed with tabs Home / Ask / Lectures / Assignments and NO uploader. The actual drop zone ("Add a lecture / Drop a lecture recording here / Choose a file") lives only on the Lectures tab (fac-le
- What I expected: Clicking a button literally labelled "Upload lecture" should put an upload control on screen, or land me on the Lectures tab with the dropzone visible.
- Why this is a problem: The single most important faculty action deposits the user one click short of the thing it promised, on a page whose visible content is unrelated (an activity list). A first-time faculty member reasonably concludes there is no way to upload and gives up or hunts through tabs. This is exactly the "click for upload on the course page finds no control" failure the brief flagged.
- Severity: Medium   |   Classification: BROKEN
- Recommended direction: Point the CTA at the Lectures tab (e.g. `/courses/{id}?tab=lectures` or `#lectures`) so the dropzone is visible on arrival, OR add the same "Add a lecture" affordance to the course Home tab. The label and the destination must match.
- Evidence: CoursesClient.tsx:366; fac-course-qa--desktop.png shows course Home with no uploader; fac-lectures--desktop.png shows the dropzone only under the Lectures tab

[ISSUE] Create-course language helper text reads as a cryptic bug report
- Location: src/app/_components/CoursesClient.tsx:196-197 (LANGUAGE_HINT); screenshot fac-create-course--desktop.png
- What happened: The "Lecture language" field helper text reads verbatim: "Auto-detect once romanized an English lecture into Arabic. Pick what you teach in." The language options are English (India), Hindi / Hinglish, and Auto-detect (not recommended).
- What I expected: Field help that tells me what to pick and why, in plain terms.
- Why this is a problem: The code comment (CoursesClient.tsx:194-195) shows this is a genuine, well-intentioned warning about a real incident — but as user-facing microcopy it is baffling to a first-time faculty member. It references "Arabic", which appears nowhere in the options, and reads like an internal defect note rather than guidance. The takeaway ("don't rely on auto-detect; set your teaching language explicitly") is buried behind an 
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Rewrite as guidance, e.g. "Set the language you teach in. Auto-detect can guess wrong and mis-transcribe the whole lecture, so it is not recommended." Keep the incident detail in the code comment, not the UI.
- Evidence: CoursesClient.tsx:196-197; fac-create-course--desktop.png shows the literal string under "Lecture language"

[ISSUE] Status vocabulary is inconsistent across badges, eyebrows and detail pages
- Location: screenshots fac-home--desktop.png, fac-lecture-pending--desktop.png, fac-course-qa--desktop.png
- What happened: The same lifecycle states are named different things depending on where you look. A live lecture shows a green badge "Published" but the card eyebrow beneath it says "LIVE" (fac-home). The awaiting state is a badge "Awaiting upload", a card sub-label "UPLOAD · WAITING FOR AUDIO" (fac-home), an activity line "Waiting for the audio file." (fac-course-qa), and a detail banner "This lecture has no recording yet / The upl
- What I expected: One name per state, used everywhere.
- Why this is a problem: Faculty have to learn that Published = LIVE, and that four different awaiting-upload phrasings are the same thing. It makes the status system feel unfinished and forces re-reading to confirm two labels mean the same state.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Define a single canonical label per lecture state (e.g. Live, Awaiting upload, Failed, Processing) and reuse it for badge, eyebrow and detail banner. Vary the supporting sentence, not the state name.
- Evidence: fac-home--desktop.png "Published" badge + "LIVE" eyebrow on the same card; "Awaiting upload" badge + "UPLOAD · WAITING FOR AUDIO" sub-label; fac-course-qa "Waiting for the audio fi

[ISSUE] Awaiting-upload state uses a spinner icon, implying active progress on a terminal stalled state
- Location: screenshot fac-lecture-pending--desktop.png (banner icon next to "This lecture has no recording yet")
- What happened: The Awaiting upload banner is prefixed with a circular spinner-style loader glyph, next to text explaining the upload never finished and there is nothing to process — a stalled/terminal state, not something in flight.
- What I expected: A neutral/idle or warning icon for a stalled state; a spinner only when something is actively running.
- Why this is a problem: A spinner signals "working, please wait", so a faculty member may sit and wait for a process that will never start, instead of re-uploading. It contradicts the accompanying text.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Use a static idle/attention icon for the awaiting-upload state; reserve the spinner for genuinely in-progress transcription/extraction.
- Evidence: fac-lecture-pending--desktop.png shows a spinner glyph beside "This lecture has no recording yet / The upload never finished"

[ISSUE] Two lectures with the identical title "Robotics and Automation trial" are indistinguishable in the feed
- Location: screenshot fac-home--desktop.png (Recent lectures list)
- What happened: The Recent lectures list shows two entries both titled "Robotics and Automation trial", both "Test1 · 4 days ago", one badged Published/LIVE and one Failed. Nothing but the status badge distinguishes them.
- What I expected: Enough on each row to tell two same-day lectures apart.
- Why this is a problem: When the same title appears twice on the same day, faculty cannot tell which recording is which without opening both. If they act on the wrong one (e.g. delete), the error is easy to make.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Show a disambiguating detail on each row (time of day, file name, or size), and/or warn on duplicate-title uploads within a course.
- Evidence: fac-home--desktop.png: two "Robotics and Automation trial / Test1 · 4 days ago" rows, one Published, one Failed

[ISSUE] "Delete this recording" is offered on a lecture that has no recording
- Location: screenshot fac-lecture-pending--desktop.png (footer action)
- What happened: The awaiting-upload lecture page (no audio ever uploaded, "nothing to process") still shows a "Delete this recording" action in the footer.
- What I expected: The action label should match what actually exists — there is a lecture entry but no recording.
- Why this is a problem: Offering to delete a recording that the same page says does not exist is contradictory and makes the destructive action ambiguous — does it remove the empty lecture entry, or is it a no-op? Minor, but adds to the unfinished feel of the empty state.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Relabel to "Delete this lecture" (or "Remove") in states where no recording exists, so the destructive action names its real target.
- Evidence: fac-lecture-pending--desktop.png shows "Delete this recording" under a lecture with "no recording yet"

[ISSUE] Failure copy consistently reassures what survived and what to do — genuinely good
- Location: src/app/_components/LectureUpload.tsx:72-87 (FAILURE_COPY); screenshots fac-home--desktop.png, fac-lecture-failed--desktop.png
- What happened: Every failure message names what was preserved and the next step: "Your recording is stored safely and nothing was lost", "Nothing from this lecture reached your students. It was held back automatically", and each FAILURE_COPY variant states what survived. The default language is English (India) with Auto-detect marked "(not recommended)".
- What I expected: Typical failure states that just say "error".
- Why this is a problem: Not a problem — this is a deliberately reassuring, action-oriented failure design and a sane safe default for language. Worth preserving as the bar for the other states (which should match this quality; see the pending-state and status-vocabulary findings).
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep this pattern; extend the same clarity and single-label discipline to the awaiting-upload and Published/LIVE states.
- Evidence: LectureUpload.tsx:75-87; fac-lecture-failed--desktop.png "Nothing from this lecture reached your students. It was held back automatically"; CoursesClient.tsx:188-191 default langua

[ISSUE] No in-browser lecture recording — file upload is the only way to add a lecture
- Location: src/app/_components/LectureUpload.tsx / CoursesClient.tsx (upload only); no recorder component in src/
- What happened: The only path to add a lecture is uploading an audio file; there is no in-app recorder.
- What I expected: Founder direction: faculty should eventually add a lecture two ways — upload OR record directly in the web app.
- Why this is a problem: In-app capture removes the export-then-upload step and is a natural faculty capability. Explicitly a future item.
- Severity: Low   |   Classification: FUTURE PRODUCT OPPORTUNITY
- Recommended direction: Plan a browser MediaRecorder capture flow feeding the same upload→transcribe→extract pipeline. Do NOT build yet; recorded as the intended second input.
- Evidence: no recorder component in src/; LectureUpload/CoursesClient are upload-only

## Part 9 — Profile / Account (6)

[ISSUE] No profile/account page exists — the dropdown is the entire account surface
- Location: src/app (no `profile` route); src/app/_components/SignOutButton.tsx:38-147 (UserMenu); src/app/layout.tsx (only render site)
- What happened: Grep confirms there is NO src/app/profile route (find src/app -iname *profile* returns only src/app/api/profile). The user's only account surface is the top-right UserMenu dropdown, which renders exactly three read-only facts (name, email, role label) plus a single 'Sign out' action.
- What I expected: As a first-time user, clicking my name/avatar I expect to reach an account area where I can review and manage my account — at minimum a page, not a 4-line popover that is purely a sign-out affordance with an identity caption.
- Why this is a problem: There is no place in the product to manage the account. Everything a user might want to do to their account (rename, settings, security, avatar, leave) has nowhere to live. The dropdown is a dead-end.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add a real /profile (or /account) route linked from the dropdown. Even a minimal page (editable name, email display, role, sign out, danger zone) turns the read-only caption into an actual account surface.
- Evidence: stu-usermenu--desktop.png (dropdown shows 'Test student / student.test@classmind.local / Student / Sign out' and nothing else); Bash: 'NO src/app/profile'; SignOutButton.tsx:113-14

[ISSUE] Cannot edit your name anywhere in the UI — even though the backend already supports it
- Location: src/app/api/profile/route.ts:71-77 (accepts fullName update); callers grep: only choose-role + signin
- What happened: POST /api/profile explicitly supports updating full_name for the signed-in user (route.ts:71-77). But the only callers are src/app/choose-role/ChooseRoleForm.tsx, choose-role/page.tsx and signin/page.tsx — all onboarding. After onboarding there is no screen that calls it. The UserMenu shows the name as static text (SignOutButton.tsx:123) with no edit control.
- What I expected: If my name is wrong (or I never set one — the code at SignOutButton.tsx:56 falls back to email or 'Account'), I expect to be able to fix it. The server can already do it.
- Why this is a problem: A working, session-safe rename endpoint exists but is unreachable from the running product. Users whose name is blank or wrong are permanently stuck with what onboarding captured. This is missing UI over finished backend — the cheapest possible feature to complete.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add an inline name field (a profile page or an edit-in-menu) that POSTs { fullName } to the existing /api/profile. No new backend needed.
- Evidence: route.ts:71-77 (`update({ full_name })`); Bash callers grep shows only choose-role/signin; SignOutButton.tsx:123 renders name as plain <p>

[ISSUE] No settings of any kind — notifications, appearance, language, security
- Location: src/app (no settings route); Bash find -iname *setting* returned nothing
- What happened: There is no /settings route and no settings link anywhere. The dropdown jumps straight from identity caption to 'Sign out'.
- What I expected: A product students and faculty log into repeatedly usually offers at least a couple of preferences (notification email, language given this is a Hinglish/multilingual product, password/security).
- Why this is a problem: Zero user-controllable configuration. For a multilingual lecture product, absence of any language or notification preference is a notable gap, not just polish.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Introduce a settings surface once there is a first real preference to expose (language is the strongest candidate given the product's Hinglish focus). Do not build an empty settings shell before there is something to put in it.
- Evidence: Bash: find src/app -iname *setting* returned NONE; stu-usermenu--desktop.png shows no settings entry in the menu

[ISSUE] Role is displayed but there is no path to correct a wrongly-set role
- Location: src/app/api/profile/route.ts:15-17,64-69 (role immutable); SignOutButton.tsx:59,128 (role shown)
- What happened: The menu shows 'Student' (SignOutButton.tsx:59,128). Role is set once during onboarding and is deliberately immutable (route.ts:64-69 returns 409 on any change; comment lines 15-17 say a role-change feature 'does not exist yet'). A user who picked the wrong role at /choose-role has no in-product way to fix it.
- What I expected: If I accidentally onboarded as faculty when I'm a student, I expect some way to request a correction — even a support link — not a silently unchangeable label.
- Why this is a problem: The immutability is a sound security choice, but pairing an unchangeable role with zero recovery path strands anyone who misclicks onboarding. They must contact someone out-of-band with no hint that this is even possible.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add a 'Wrong role? Contact support' affordance near the role label, or an admin-mediated change flow. Keep the endpoint immutable; add a human recovery path.
- Evidence: route.ts:64-69 (409 'cannot be changed here'), route.ts:15-17 (comment: feature does not exist yet); stu-usermenu--desktop.png shows 'Student' as static text

[ISSUE] No avatar — only a derived single-letter initial, with no way to set an image
- Location: src/app/_components/SignOutButton.tsx:58,100-105
- What happened: The avatar is a generated initial (displayName.charAt(0), line 58) in an accent circle (lines 100-105). There is no avatar upload or image anywhere in the account surface.
- What I expected: Most accounts let you at least see, if not set, a profile photo.
- Why this is a problem: Minor, but contributes to the account area feeling unfinished. The initial-only avatar is a reasonable default; the gap is that it can never be anything else.
- Severity: Low   |   Classification: MISSING
- Recommended direction: Optional and low priority. If added later, put avatar upload on the profile page; the initial fallback (SignOutButton.tsx:58) is already a good empty state.
- Evidence: SignOutButton.tsx:58 (`initial = displayName.charAt(0)`), 100-105 (rendered circle)

[ISSUE] The identity caption itself is well-built for account disambiguation
- Location: src/app/_components/SignOutButton.tsx:56-59,122-129
- What happened: The dropdown cleanly shows name, email (suppressed when it equals the name, line 125-127), and a humanized role label ('Student' / 'Faculty' / 'New account', line 59), with sensible fallbacks when name or email is missing (line 56).
- What I expected: A quick 'which account am I in' check.
- Why this is a problem: Not a problem — this is the one thing the account area does well, and it matches its stated intent (the three facts you check when unsure which account you're in, comment lines 12-14). Worth preserving as the profile area grows.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep this identity block as the header of a future profile page rather than discarding it. The null-safe fallbacks and email-dedup are correct.
- Evidence: SignOutButton.tsx:56 (fallback chain), 125-127 (email dedup), 59 (role label); stu-usermenu--desktop.png shows the caption rendering correctly

## Part 10 — Loading / System States (5)

[ISSUE] Animated spinner sits on the settled 'no recording yet' dead-end state, reading as perpetually loading
- Location: fac-lecture-pending--desktop.png (top of the dark card) — src/app/_components/LectureClient.tsx:373-374 (isWorking includes pending_upload) and :457 (Spinner); LectureProgress.tsx:
- What happened: On the 'Lecture 1 - The cloud control layer' lecture (status pending_upload / 'Awaiting upload'), the card renders an accent-colored, continuously spinning loader (Spinner = animate-spin) immediately to the left of the heading 'This lecture has no recording yet' and the body 'The upload never finished, so there is nothing to process. Upload the recording again from the course page.'
- What I expected: A settled dead-end state (upload failed, nothing running, user must re-upload) should show a static/idle icon — an alert or upload glyph — not a motion spinner. Motion must mean work is in progress.
- Why this is a problem: A spinning loader is the universal signal that 'something is running.' Here nothing is running: pending_upload is terminal until the user re-uploads, and LectureProgress deliberately returns null for it (no polling). The animation directly contradicts the copy ('nothing to process') and makes the screen read as frozen mid-load, so a faculty user may sit and wait instead of taking the re-upload action. It also violate
- Severity: Medium   |   Classification: BROKEN
- Recommended direction: Split the waiting card: use the Spinner only for actively-processing statuses (transcribing, extracting). For pending_upload/uploaded, swap to a static AlertIcon/UploadIcon so motion never appears on a state where nothing is happening.
- Evidence: fac-lecture-pending--desktop.png shows the circular spinner beside 'This lecture has no recording yet'. LectureClient.tsx:373 `const isWorking = ["pending_upload","uploaded","trans

[ISSUE] 'Full lecture' audio placeholder claims 'the transcript below is complete' when there is no transcript at all
- Location: fac-lecture-pending--desktop.png ('Full lecture' section) — src/app/_components/AudioPlayer.tsx:104-113 rendered from LectureClient.tsx:593-597; transcript action gated out at Lect
- What happened: On the same pending_upload lecture (no audio, no transcript), the 'Full lecture' section renders the AudioPlayer null-src fallback: 'The recording is not available right now. The transcript below is complete, and every timestamp still jumps to the right line.' No transcript is shown below it — the 'Show transcript' toggle is hidden because segments.length is 0.
- What I expected: For a lecture that never finished uploading, the 'Full lecture' block should either not render, or say there is neither a recording nor a transcript yet — not assert that a complete transcript exists.
- Why this is a problem: The message is factually false in this state. AudioPlayer's null-src copy was written for the 'recording expired but transcript retained' case (a ready lecture whose audio URL lapsed), but it is rendered unconditionally whenever audioUrl is null — including pending_upload, where segments is empty and nothing renders beneath it. A user reads 'the transcript below is complete,' looks below, and finds nothing. It makes 
- Severity: Medium   |   Classification: BROKEN
- Recommended direction: Gate the 'Full lecture' section (or the AudioPlayer fallback copy) on whether a transcript actually exists. When segments/rawFallback are empty, suppress the section or show a neutral 'No recording or transcript yet' message instead of the expired-audio copy. Note LectureClient already computes noAudioYet (:378) and us
- Evidence: fac-lecture-pending--desktop.png shows the 'Full lecture' placeholder text with no transcript below. AudioPlayer.tsx:104 `if (!src || failed)` -> :109-110 the 'transcript below is 

[ISSUE] Ask loading states are genuinely well-designed — content-shaped skeletons in a single live region, no generic spinner
- Location: stu-global-ask-new--desktop.png — src/app/_components/AskPanel.tsx:225-261 (Looking + aria-live/aria-busy region); AskWorkspace.tsx:478-487 (conversation-load skeleton with role=st
- What happened: The Ask answer wait renders a 'Looking through your lectures…' line plus three text-width skeleton bars inside one aria-live=polite, aria-busy region; the conversation-restore wait renders a bubble-shaped skeleton with role=status, aria-busy and an sr-only 'Loading your conversation.' label.
- What I expected: This is the standard I would want everywhere: branded, describes what is coming, no jarring spinner, and screen-reader announced from one region.
- Why this is a problem: Not a problem — noting it as the correct pattern the pending-lecture spinner (finding 1) should have followed. The team's own comment (AskPanel.tsx:246) articulates why: a skeleton says how much text is about to arrive; a spinner only says something is running.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep. Use this as the reference pattern and retrofit the LectureClient waiting card to match (idle icon for idle states, motion only for active ones).
- Evidence: AskPanel.tsx:228 `<div aria-live="polite" aria-busy={asking}>`, :249-261 Looking with three <Skeleton/> bars. AskWorkspace.tsx:479 `<div role="status" aria-busy="true">` with :480 

[ISSUE] Processing pipeline is shown as a branded 5-stage narrative track, not a corner status enum
- Location: fac-home--desktop.png (each lecture card: 'TRANSCRIBE · FAILED HERE', 'LIVE', 'UPLOAD · WAITING FOR AUDIO') — src/app/_components/ui/index.tsx:780-857 (PipelineTrack + stageStates)
- What happened: Each faculty lecture card renders a five-segment track (upload → transcribe → read → review → live): lit segments for done, a 'cm-breathe' animated segment for active, a red segment plus 'failed here' caption at the exact failing stage, with a mono caption. It pairs with a worded StatusPill and is aria-hidden so the pill carries meaning for screen readers.
- What I expected: Most products reduce processing to a single spinning badge; this communicates where in the pipeline a lecture is and where it broke.
- Why this is a problem: Not a problem — this is the polished, branded processing feedback the brief asks for, and it degrades correctly (red at the failing stage rather than a generic 'error'). Worth preserving as a signature element.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep. This is the strongest system-state affordance in the app.
- Evidence: ui/index.tsx:803-825 stageStates maps each status to segment fills and captions incl. 'transcribe · failed here'; :828-833 SEGMENT_CLASS uses 'bg-accent cm-breathe' for active; vis

[ISSUE] No route-level loading.tsx boundaries exist; loading coverage depends entirely on per-component client skeletons
- Location: Whole app — src/app/**/loading.tsx (Glob: 0 files). Coverage comes from CoursesClient.tsx:389-391/562 HomeSkeleton, the lecture page's own Suspense fallback (courses/[id]/lectures/
- What happened: There is not a single Next.js loading.tsx in the route tree. The home routes render via a client component that shows HomeSkeleton while it fetches, and the lecture route wraps its client in a local Suspense boundary with LectureSkeleton — but there is no automatic route-transition skeleton for server-rendered navigations that lack their own.
- What I expected: For an App Router app, a loading.tsx (or Suspense) at the segment level gives an instant skeleton on every navigation; relying on each destination component to self-manage a loading flag is easy to miss for a new page.
- Why this is a problem: Today the major routes happen to be covered (home = client skeleton, lecture = Suspense skeleton, ask = client skeleton), so this is not a visible break in these screenshots. But the pattern is fragile: any future async server page added without its own skeleton will show the previous route frozen during data fetch, with no framework-level fallback to catch it. It is a structural gap, not yet a defect.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Add loading.tsx at the course and top-level segments (reusing the existing Skeleton primitives) so route transitions get an automatic branded fallback and new pages inherit it by default rather than each re-implementing a loading flag.
- Evidence: Glob 'src/app/**/loading.tsx' returned no files. Contrast: courses/[id]/lectures/[lectureId]/page.tsx:1,10-19 hand-rolls a Suspense LectureSkeleton; CoursesClient.tsx:389-391 gates

## Part 11b — Dead / Non-functional / Redundancy (8)

[ISSUE] Global Ask (/ask) — the flagship feature — has no persistent navigation entry; it is reachable only from the student home hero
- Location: src/app/layout.tsx:79-96 (global header nav); src/app/_components/StudentHome.tsx:102 (only launcher); src/app/_components/shell/ClassShell.tsx:29-33 (TABS)
- What happened: The signed-in global header contains exactly two nav items: a 'Courses' link and the user menu (layout.tsx:81-87). There is no 'Ask' entry. The only way to reach global /ask is the composer/prompt-chips on the student home hero (StudentHome.tsx:102 router.push('/ask')) or a saved 'All subjects' conversation row. The per-course tab bar's 'Ask' (ClassShell TABS slug '/ask') is course-scoped, not global. Once a student 
- What I expected: The product's headline promise ('Ask across all your classes', grounded, cited) should have a durable, always-available entry point — e.g. an 'Ask' item in the global header next to 'Courses' — so a student can invoke it from any screen, not just by first navigating home.
- Why this is a problem: The single most important student action is orphaned behind one specific screen. A student reading a lecture who wants to ask across subjects must back out to Courses, then find the hero. Flagship features buried one-screen-deep get used far less than the marketing copy implies they will.
- Severity: Medium   |   Classification: MISSING
- Recommended direction: Add a global 'Ask' nav link (to /ask) in layout.tsx's signed-in <nav>, alongside 'Courses'. It is the product's verb — it deserves top-level, persistent placement.
- Evidence: layout.tsx:79-88 nav renders only Courses + UserMenu; StudentHome.tsx:102 is the sole router.push('/ask'); grep for href='/ask' finds no header/global link. Screenshots stu-course-

[ISSUE] Dead code: an entire second Ask implementation (AskPanel, titled 'Ask ClassMind') is never rendered
- Location: src/app/_components/AskPanel.tsx (default export, title 'Ask ClassMind' at :160); src/app/_components/KnowledgePanel.tsx:333-344 (CourseKnowledgePanel showAsk) and :467-490 (defaul
- What happened: AskPanel's default component is only rendered inside KnowledgePanel/CourseKnowledgePanel behind `showAsk` (KnowledgePanel.tsx:344, :490). No caller in the app passes showAsk=true, and CourseKnowledgePanel and the default KnowledgePanel export are not imported anywhere (only useCourseKnowledge, topicUnits, LectureKnowledge, StillWorking are). So AskPanel — a full single-turn Ask UI that calls GET /api/courses/{id}/ask
- What I expected: One Ask implementation. A shipped codebase should not carry a second, differently-named, differently-wired (GET vs POST) copy of its central feature that no screen mounts.
- Why this is a problem: Two divergent Ask UIs are a maintenance and correctness hazard: the dead GET path bypasses the persistence/conversation logic the live path depends on, and it is the sole source of the third feature name 'Ask ClassMind'. Anyone editing Ask behavior can mistakenly patch the dead one, or resurrect it and reintroduce the naming/endpoint split.
- Severity: Medium   |   Classification: UNNECESSARY
- Recommended direction: Delete AskPanel's default component and the showAsk branches in KnowledgePanel (keep the exported helpers AnswerView/Looking/SUGGESTIONS that AskWorkspace actually uses). Remove the 'Ask ClassMind' string with it.
- Evidence: grep: showAsk is passed true by no caller; CourseKnowledgePanel and 'KnowledgePanel from' have zero importers outside KnowledgePanel.tsx; AskPanel default is imported only by Knowl

[ISSUE] The Ask feature is named four different ways across the surfaces that launch and host it
- Location: StudentHome.tsx:126 & :120; src/app/ask/page.tsx (intro title); AskWorkspace.tsx:614 (course default); LectureClient.tsx:498; AskPanel.tsx:160 (dead)
- What happened: Every Ask surface headlines the same feature with a different name. Home hero: eyebrow 'ASK CLASSMIND' + title 'Ask across all your classes.' (StudentHome.tsx:120,126). Global /ask destination: 'Your academic context, in one place' (ask/page.tsx intro). Course Ask tab: 'Ask this class anything' (AskWorkspace.tsx:614 default intro). Lecture: 'Learn this lecture' (LectureClient.tsx:498). Plus the dead AskPanel's 'Ask C
- What I expected: One consistent name/identity for the feature, with scope expressed as a qualifier (e.g. 'Ask — all subjects', 'Ask — Robotics & Automation', 'Ask — this lecture'), so the launch surface and the destination read as the same thing.
- Why this is a problem: A student can't build a mental model of one 'Ask' feature when its title changes completely between the button they pressed and the page they arrive on. The name is the product's core verb; four names dilute it and make each screen feel like a separate, unfinished tool.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Pick one feature name (the eyebrow 'Ask ClassMind' or 'Ask' is the natural anchor) and reuse it as the headline on every scope, differentiating by a scope subtitle rather than a wholly new title. Make the home-hero title and the /ask destination title match.
- Evidence: StudentHome.tsx:126 vs ask/page.tsx intro vs AskWorkspace.tsx:614 vs LectureClient.tsx:498. Screenshots: stu-home--desktop.png ('Ask across all your classes.'), stu-global-ask--des

[ISSUE] 'Pick up where you left off' shows indistinguishable duplicate conversation rows
- Location: src/app/_components/StudentHome.tsx:276-291 (recentConversations render, no dedup)
- What happened: The 'Pick up where you left off' list renders each recent conversation row as title + 'where · ago' with no other distinguishing metadata (StudentHome.tsx:441-445). In stu-home--desktop.png two rows are byte-for-byte identical to the reader: 'What do I need to work on' / 'All subjects · 2 hours ago', appearing twice. Nothing tells the two threads apart or which to resume.
- What I expected: Either de-duplicate same-title/same-scope threads into one row, or add a distinguishing detail (a snippet of the last answer, an exact time) so two rows are never visually identical.
- Why this is a problem: The whole point of this band is 'open one and keep going' (StudentHome.tsx:279). When two rows are indistinguishable the student can't choose deliberately — the memory feature it showcases looks like it duplicated a row by accident, which undercuts trust in the persistence the release is built around.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Add a last-message preview line or an absolute timestamp to ConversationRow, and/or collapse exact-duplicate title+scope threads. At minimum, make identical-looking rows impossible.
- Evidence: stu-home--desktop.png 'Pick up where you left off' lists 'What do I need to work on / All subjects · 2 hours ago' twice. StudentHome.tsx:439-448 ConversationRow renders only title 

[ISSUE] The Ask submit button is a solid primary on the home hero but a faint secondary everywhere else (until text is typed)
- Location: StudentHome.tsx:157 (always primary); AskWorkspace.tsx:574 (secondary-until-typed); AskPanel.tsx:198 (secondary-until-typed, dead)
- What happened: On the home hero the Ask button is hard-coded tone='primary' (solid blue) at all times (StudentHome.tsx:157). On /ask, the course Ask tab and the lecture page, the identical Ask button is tone={draft.trim() ? 'primary' : 'secondary'} (AskWorkspace.tsx:574) — so it renders as a faint grey secondary until the student types. The same action, launched from two places one click apart, has two different visual weights and 
- What I expected: The primary Ask affordance should look the same across surfaces. Either both start solid, or both start quiet-until-typed — not a solid blue on home and a barely-there grey on the destination it navigates to.
- Why this is a problem: Visual weight is how users find the primary action. A student who pressed a bold blue 'Ask' on home arrives at /ask and sees a washed-out grey 'Ask', which reads as disabled/broken (the AskPanel comment at :191 even calls a half-faded primary 'ambiguous between disabled and broken' — yet the home hero and the destination disagree on the fix). It makes the flagship surface look less finished than its own launcher.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Standardize the Ask button tone. Given the empty-composer 'quiet until typed' rationale in AskWorkspace/AskPanel, apply the same logic to the home hero button (StudentHome.tsx:157), or make all four solid — but pick one.
- Evidence: StudentHome.tsx:157 tone='primary' constant vs AskWorkspace.tsx:574 tone={draft.trim()?...}. Screenshots: stu-home--desktop.png hero shows a solid blue 'Ask'; stu-global-ask--deskt

[ISSUE] 'What you have to do' is the same section, with the same cards, on three screens: global home, course Home tab, and course Assignments tab
- Location: StudentHome.tsx:219 (global home); src/app/_components/shell/ClassHome.tsx:125 (course Home tab); src/app/_components/shell/ClassAssignments.tsx:96 (Assignments tab)
- What happened: The section titled 'What you have to do' renders on the global student home (StudentHome.tsx:219), again on the course Home tab (ClassHome.tsx:125), and again on the course Assignments tab (ClassAssignments.tsx:96). The Transformation Assignment card the student sees on the global home is the same card shown on the course Home (stu-course-robotics--desktop.png) and on Assignments. The course Home tab even links to th
- What I expected: Each obligation shown in one authoritative place, with other screens summarizing or linking rather than re-rendering the full card. A 'Home' tab and an 'Assignments' tab should not both be a full assignments list under the same heading.
- Why this is a problem: The same heading and the same cards on three screens teaches the reader that sections don't mean anything distinct — the course Home tab is largely a copy of the Assignments tab, so the tab split earns its keep only for the 'Activity' band. Repetition also multiplies the maintenance surface for identical copy.
- Severity: Low   |   Classification: UNNECESSARY
- Recommended direction: Let Assignments own 'What you have to do' in full; on the course Home tab, show a compact summary that links out (the link already exists at ClassHome.tsx:128) rather than the full duplicated card list. Keep the global home's aggregate view (it serves a genuinely different, cross-course purpose).
- Evidence: StudentHome.tsx:219, ClassHome.tsx:125, ClassAssignments.tsx:96 all use Section title='What you have to do'. Screenshot stu-course-robotics--desktop.png shows the course Home 'What

[ISSUE] The global header carries two links to the same destination (wordmark and 'Courses' both → /courses)
- Location: src/app/layout.tsx:69-77 (wordmark link) and :81-86 ('Courses' link)
- What happened: When signed in, both the ClassMind wordmark (layout.tsx:70, href='/courses') and the 'Courses' nav item (layout.tsx:82, href='/courses') point to the same route. On the home page itself, clicking 'Courses' is a no-op reload of the page already shown.
- What I expected: One home affordance in the header, or the second slot used for a distinct destination (e.g. the missing global 'Ask' entry).
- Why this is a problem: Two identical destinations waste the header's most valuable real estate — the same slot could carry the flagship 'Ask' link that is currently unreachable from within courses (see the hidden-nav finding). Minor on its own, but it is a symptom of the same gap.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Keep the wordmark as the home affordance and repurpose the 'Courses' slot — or add 'Ask' beside it so the two header links go to genuinely different places.
- Evidence: layout.tsx:70 and :82 both href='/courses'. Screenshots stu-home/stu-usermenu--desktop.png show wordmark + 'Courses' in the header while the page shown is /courses.

[ISSUE] Home-hero Ask suggestion chips and /ask destination suggestion chips are different sets
- Location: src/app/_components/StudentHome.tsx:68-72 (GLOBAL_PROMPTS) vs src/app/ask/page.tsx (suggestions array)
- What happened: The home hero offers three prompt chips: 'Do I have anything to do?', 'What is due next?', 'What should I work on?' (StudentHome.tsx:68-72). The /ask page — the destination those chips lead to — offers a different four: 'Do I have anything to do?', 'What assignments do I have?', 'What topics were covered?', 'What should I work on first?' (ask/page.tsx). Only the first overlaps; 'What is due next?' exists on home but 
- What I expected: The launcher and its destination should offer the same starter questions, or the launcher's chips should simply carry through, so the student sees a consistent set of example questions for one feature.
- Why this is a problem: Two hand-authored lists for the same feature drift and must be kept in sync manually; the student also gets a subtly different menu of 'what can I ask' depending on entry point, which reads as two features rather than one.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Define one canonical global-scope suggestion set and reference it from both StudentHome and ask/page.tsx.
- Evidence: StudentHome.tsx:68-72 GLOBAL_PROMPTS (3 items) vs ask/page.tsx suggestions (4 items); only 'Do I have anything to do?' is shared.

## Part 11 — The Non-Developer Test (14)

[ISSUE] Landing page offers no way to create an account — only "Sign in" (twice)
- Location: anon-landing--desktop.png (top-right nav + hero button)
- What happened: The only two calls-to-action on the entire landing page both say "Sign in" — one in the top nav, one as the blue hero button. There is no "Sign up", "Get started", "Create account", or "Request access" anywhere.
- What I expected: A first-time visitor who has never used ClassMind expects an obvious way to create an account or start, distinct from signing into an existing one.
- Why this is a problem: This is the literal first screen and the first-3-seconds test. A brand-new user reads "Sign in" as "you need an account you don't have" and has nowhere to go. Even if sign-in doubles as sign-up (e.g. Google SSO), nothing tells them that. The primary conversion path is ambiguous on the one screen whose whole job is conversion.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Either add an explicit "Get started / Create account" CTA, or relabel the hero button to make first-time entry obvious (e.g. "Sign in with Google" / "Get started — it's free"). The nav and hero should not be two identical "Sign in" links.
- Evidence: anon-landing--desktop.png shows "Sign in" in nav and a blue "Sign in" hero button; no other CTA exists on the page.

[ISSUE] Global Ask on mobile: composer sits under content with a huge empty void beneath it
- Location: stu-global-ask--mobile.png (lower two-thirds)
- What happened: After a short answer, the "Ask about anything…" composer appears mid-screen, and everything below it down to the footer — well over half the screen height — is empty black space.
- What I expected: On mobile, a chat composer should be pinned to the bottom of the viewport, with the conversation scrolling above it.
- Why this is a problem: A floating composer with a giant void underneath looks like a layout bug, not a design. It wastes the most valuable real estate on mobile and makes the screen feel unfinished.
- Severity: Medium   |   Classification: UX IMPROVEMENT
- Recommended direction: Pin the composer to the bottom of the mobile viewport (sticky), or grow the conversation area to fill the screen so no dead band remains.
- Evidence: stu-global-ask--mobile.png: composer at ~y740 (of 3674px original), then empty space until footer near the bottom.

[ISSUE] Two different courses both display as "Cloud Computing", separable only by a code
- Location: stu-course-robotics-fold--desktop.png (left sidebar) and fac-home--mobile.png (Your courses)
- What happened: The enrolled/courses list shows "Cloud Computing CC101" and "Cloud Computing TEST2" (and faculty side shows a third, "Cloud Computing (QA walkthrough) QA-BROWSER"). The prominent name is identical; only the small monospace code distinguishes them.
- What I expected: Each course in a list should be distinguishable at a glance by its main label.
- Why this is a problem: When two rows share the same big name, a student picking which "Cloud Computing" to open has to read and decode a course code they may not have memorized. This is a real information-architecture trap, not just seed noise — the system permits duplicate display names.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Surface a distinguishing attribute (term, faculty, section) alongside duplicate course names, or require/emphasize unique course titles.
- Evidence: stu-course-robotics-fold--desktop.png sidebar lists "Cloud Computing CC101" and "Cloud Computing TEST2"; fac-home--mobile.png repeats the pattern.

[ISSUE] Faculty course cards show a raw hex string with no label
- Location: fac-home-fold--desktop.png and fac-home--mobile.png (Your courses cards)
- What happened: Each faculty course card shows a monospace hex token like "903a904e", "af065b5f" beneath the course meta, with no caption explaining what it is.
- What I expected: If this is a join/enrolment code students need, it should be labeled (e.g. "Join code: …"); if it's an internal ID, it shouldn't be shown at all.
- Why this is a problem: An unlabeled hex string reads as a leaked internal identifier and makes the surface feel like a dev build. If it IS the code students use to join, its purpose is completely hidden by the lack of a label — a functional feature rendered useless.
- Severity: Medium   |   Classification: CONFUSING
- Recommended direction: Label the token with its purpose and a copy affordance if it's a join code; remove it if it's an internal ID.
- Evidence: fac-home-fold--desktop.png cards show "903a904e" and "af065b5f" with no accompanying label.

[ISSUE] Lecture chat has a large empty band between the composer and the "What was taught" section
- Location: stu-lecture-chat--desktop.png (mid-lower page)
- What happened: Below the "Ask anything about this lecture" composer (~y1365) there is a tall blank region before "What was taught" / "Full lecture" appear (~y1630+).
- What I expected: Sections should flow with consistent spacing; a chat composer shouldn't leave a big void before the next section.
- Why this is a problem: The gap makes the page feel like it ended, so a user may not scroll to discover "What was taught" (3 items) and the transcript/audio player — genuinely useful content that gets buried below dead space.
- Severity: Medium   |   Classification: UX IMPROVEMENT
- Recommended direction: Reduce the gap and/or give a visual cue that more (knowledge, transcript, audio) sits below the conversation.
- Evidence: stu-lecture-chat--desktop.png: blank region between composer (~y1365) and "What was taught" (~y1630).

[ISSUE] Global Ask empty state on desktop is mostly dead space — input floats, layout feels unfinished
- Location: stu-global-ask-new--desktop.png (whole viewport)
- What happened: The new-conversation empty state places the title block and four suggestion chips in the upper third, then a large blank band, then the input row docked low, then more blank space to the footer. Roughly half the viewport is empty.
- What I expected: An empty chat state should feel composed — either centered content with the composer directly beneath the prompts, or a full-height chat column with the composer pinned to the bottom edge.
- Why this is a problem: The vertical gap between the suggestion chips and the input makes the screen read as broken or half-loaded. A normal person isn't sure the input at the bottom is connected to the suggestions above it. It undercuts the polish of an otherwise strong product.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Tighten the empty state: bring the composer up under the suggestion chips, or vertically center the block, so there is no large orphaned void.
- Evidence: stu-global-ask-new--desktop.png: chips end ~y480, input at ~y628, footer at ~y860 — large empty regions above and below the input.

[ISSUE] The Ask feature is named three different ways across screens
- Location: stu-home-fold--desktop.png vs stu-global-ask-new--desktop.png
- What happened: The home card titles the feature "Ask across all your classes." The global Ask page titles the same destination "Your academic context, in one place" with body "Ask across every subject you're in." The nav/landing brand line uses "EVERY ANSWER TRACED."
- What I expected: A feature a user clicks into should keep the same name from entry point to landing screen.
- Why this is a problem: A first-time user clicks "Ask across all your classes" and arrives at "Your academic context, in one place" — an abstract phrase that doesn't obviously match what they clicked. The mismatch creates a momentary "did I land in the right place?" doubt and weakens the feature's identity.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Pick one name for the cross-subject Ask (e.g. "Ask across your subjects") and use it on the home card, the page heading, and the composer.
- Evidence: stu-home-fold--desktop.png heading "Ask across all your classes."; stu-global-ask-new--desktop.png heading "Your academic context, in one place".

[ISSUE] Faculty "Recent lectures" lists the same lecture title twice with conflicting statuses
- Location: fac-home--mobile.png (Recent lectures)
- What happened: "Robotics and Automation trial · Test1 · 4 days ago" appears twice back-to-back — once "Published" (LIVE) and once "Failed" (TRANSCRIBE FAILED HERE) — identical title and timestamp.
- What I expected: Two entries with the same name and time should either be visibly differentiated (which upload, which attempt) or de-duplicated.
- Why this is a problem: Faculty can't tell whether this is two recordings, one recording shown twice, or a retry. Same name + same time + opposite status is exactly the kind of ambiguity that makes a teacher distrust the dashboard telling them "1 lecture needs you."
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Differentiate duplicate-named lectures (attempt number, upload time, or a distinct suffix), or collapse retries of one recording into a single card.
- Evidence: fac-home--mobile.png shows two "Robotics and Automation trial / Test1 / 4 days ago" cards, one Published and one Failed.

[ISSUE] "Answered straight from the stored lecture knowledge." repeats on every single answer
- Location: stu-lecture-chat--desktop.png and stu-global-ask--mobile.png
- What happened: The same provenance chip "Answered straight from the stored lecture knowledge." is stamped above every assistant message.
- What I expected: Reassurance about grounding is valuable once or as a subtle per-message marker, not as a full repeated sentence on each turn.
- Why this is a problem: In a multi-turn conversation the identical sentence stacks visually and adds noise, competing with the actual answers. Repetition dilutes the very trust signal it's trying to convey.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Shrink it to a compact icon/badge per message, or show the full phrasing only on the first answer of a conversation.
- Evidence: stu-lecture-chat--desktop.png shows the phrase above three consecutive answers.

[ISSUE] Pervasive test/seed naming leaks into the product UI ("Test", "Test1", "Test2", "QA-BROWSER", "CC Lec1")
- Location: All logged-in screenshots (stu-home, fac-home, course, lecture)
- What happened: User is "Test"; courses are coded "Test1", "Test2", "QA-BROWSER"; a lecture is "CC Lec1". These placeholder/dev names are shown as first-class content.
- What I expected: Even in seeded/demo states, names should look like plausible real courses and users.
- Why this is a problem: For the non-developer test, this is the single biggest "is this a real product?" signal — it reads as an unfinished internal build. It also compounds the duplicate-name problem (Test1/Test2 as course codes).
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Seed demo/QA environments with realistic course titles, codes, and a real display name; keep obvious test tokens like "QA-BROWSER" out of user-facing surfaces.
- Evidence: stu-home-fold--desktop.png greeting "GOOD EVENING, TEST"; sidebar codes "Test1/Test2"; fac-home-fold--desktop.png "QA-BROWSER", "CC Lec1".

[ISSUE] Mobile Ask input placeholders are clipped mid-word
- Location: stu-home--mobile.png and stu-global-ask--mobile.png (composer)
- What happened: The Ask input placeholder truncates without ellipsis — "Ask anything across your subjec" on home, "Ask about anything across you" on global ask.
- What I expected: Placeholder text should fit the field or truncate gracefully with an ellipsis.
- Why this is a problem: A sentence cut off mid-word ("subjec", "you") looks broken and slightly cheap on the most-used viewport.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Shorten the mobile placeholder (e.g. "Ask across your subjects…") so it fits, or widen the field relative to the Ask button.
- Evidence: stu-home--mobile.png placeholder "...your subjec"; stu-global-ask--mobile.png placeholder "...across you".

[ISSUE] Student home repeats the full 4-step assignment breakdown for each item on a "catch up" summary screen
- Location: stu-home--mobile.png ("What you have to do")
- What happened: Each assignment card on the home/catch-up screen expands the full description, all four numbered steps, and the "Not stated in the lecture" list, making each card very tall.
- What I expected: A home/catch-up view should summarize (title + one line + due signal) and let the user open the assignment for full steps.
- Why this is a problem: "Catch up / 2 things to do" promises a quick scan, but the screen is a long scroll of full assignment specs. It buries the second task and the "Pick up where you left off" list far down the page.
- Severity: Low   |   Classification: UX IMPROVEMENT
- Recommended direction: Collapse assignment steps behind the card on the home screen; keep full detail on the course/assignment page where it already lives.
- Evidence: stu-home--mobile.png renders full 4-step breakdowns for both the Transformation and Research Paper assignments on the home screen.

[ISSUE] Landing step 03 copy is hard to parse on first read
- Location: anon-landing--desktop.png ("The lecturer confirms what matters")
- What happened: Step 03 body reads "Only the things students must act on wait for a human. Teaching goes live on its own."
- What I expected: A how-it-works step should be immediately understandable to someone who has never seen the product.
- Why this is a problem: "the things students must act on wait for a human" and "Teaching goes live on its own" are cryptic — a first-time reader can't tell what actually requires the lecturer versus what's automatic. The step meant to build understanding instead adds friction.
- Severity: Low   |   Classification: CONFUSING
- Recommended direction: Rewrite plainly, e.g. "Assignments and to-dos need your lecturer's confirmation before students see them. Everything else — what was taught — is available instantly."
- Evidence: anon-landing--desktop.png step 03 text.

[ISSUE] Honest, grounded states are handled genuinely well — worth preserving
- Location: fac-home-fold--desktop.png, stu-course-robotics-fold--desktop.png, stu-lecture-chat--desktop.png
- What happened: The failed-transcription card explains the cause and reassures ("the transcription service has run out of credits… your recording is stored safely and nothing was lost") with a ref id; assignment cards openly flag "NOT SPECIFIED" for missing due dates; answers cite the exact lecture second ("06:41 'Tum logon ko ye assignment karna hai pura.'") including Hinglish quotes verbatim.
- What I expected: Most products hide failures behind generic errors and over-claim on extracted data.
- Why this is a problem: Not a problem — this honesty (explained failures, admitted gaps, second-level citations) is the product's strongest trust signal and directly delivers the "every answer traced" promise. It should be protected as the design bar for the rest of the app.
- Severity: Low   |   Classification: WORKING
- Recommended direction: Keep this pattern; extend the same candor and citation treatment to any screen that doesn't yet have it.
- Evidence: fac-home-fold--desktop.png failure card copy; stu-course-robotics-fold--desktop.png "NOT SPECIFIED" + "06:41" quote citation.
