---
layout: post
title: "The Hitchhiker's Guide to PostgreSQL Hacking"
date: 2025-10-01
tags: [Database Systems, PostgreSQL, Open Source, Development]
excerpt: "A comprehensive guide to contributing to PostgreSQL development, covering everything from motivation and setting up your environment to submitting patches, reviewing code, and engaging with the community."
---

## Motivation
The motivation to contribute to open-source projects varies from person to person—and even for the same person over time. As the saying goes, it’s “for fun and for profit.” Reasons span the spectrum from pure joy to pure utility, and there’s no conflict between the two; in practice, they often reinforce each other. To contribute sustainably over the long run, you usually need a measure of both. With that in mind, let’s talk about the fun and the profit of hacking on PostgreSQL.

## For fun
Who finds this fun? If you enjoy low-level systems programming, performance tuning, and untangling complex problems, chances are you will. The subsystems and topics of DBMS spans almost the entire landscape of computer science like JIT compilation, ultra low latency networking between distributed nodes, memory management, query optimization with machine learning, concurrency control, I/O paths, query execution and tight performance loops. These are both intellectually interesting and chanllenging. If these sounds engaging, you’ll likely find Postgres hacking both rewarding and, yes, fun.

PostgreSQL is written in C, so contributing means working close to the metal. Writing low-level code can be annoying sometimes--you need to worry about portability, managing memory, et cetra. However, it can also be rewarding too--you have much more control for the whole stack and are bestowed more power for speed and efficiency. If you enjoy squeezing out the last performance gain out of the constraint of software and hardware, then you will be pleased with hacking. Another aspect

## For profit
The DBMS market is big and still growing—scaling from near zero to well over $100B over recent decades ([Gartner](https://www.crn.com/news/cloud/2024/aws-oracle-google-microsoft-top-cloud-dbms-market-gartner), [Merv Adrian](https://www.linkedin.com/posts/mervadrian_dbms-market-2023-more-momentum-shifts-activity-7202356872757039104-oT8v)).
Relational systems hold the majority of market share, and PostgreSQL has emerged as a top choice in that segment, gaining momentum with developers ([Stack Overflow Developer Survey 2024](https://survey.stackoverflow.co/2024/technology)) and enterprises alike ([DB-Engines DBMS of the Year 2023](https://db-engines.com/en/blog_post/106), [DB-Engines Ranking](https://db-engines.com/en/ranking)). Its extensibility—custom types, indexes, procedural languages, and extensions—lets Postgres address far more than traditional SQL workloads. It's why many observers call it "the Linux of databases," steadily expanding its footprint across the broader DBMS landscape ([Fastware](https://www.postgresql.fastware.com/blog/why-postgresql-is-the-linux-of-databases), [Postgres Is Eating the Database World](https://medium.com/@fengruohang/postgres-is-eating-the-database-world-157c204dcfc4)).

## For community
PostgreSQL is ubiquitous—startups, banks, telcos, universities, governments, and every major cloud. Because it’s open and vendor-neutral, improvements help everyone at once: self-hosted, managed services, and on-prem.
- Reliability & safety: clearer errors, better pg_stat_*/wait events, stronger recovery → fewer incidents and faster on-call.
- Performance & cost: planner/storage/vacuum/WAL optimizations → lower CPU/IO, faster queries, smaller bills.
- Security & compliance: timely fixes, sane defaults, auditable permissions → easier to meet regulatory needs.
- Accessibility: better docs/tooling → shorter learning curves and a broader contributor base.

Small patches and docs changes scale to thousands of clusters—high leverage, real-world impact.

## Hacking postgres is Hard
Why talk about motivation first?

Because hacking PostgreSQL is hard, and without intrinsic motivation it’s even harder to sustain.

The challenge isn’t only technical; it’s also procedural and social.

1) Technical difficulty
	•	PostgreSQL is a large, mature C codebase with strict portability and backward-compatibility constraints.
	•	Changes must meet high bars for correctness, performance, security, tests, and docs—often across multiple platforms.
	•	As longtime committer [Robert Haas has noted](https://rhaas.blogspot.com/2024/05/hacking-on-postgresql-is-really-hard.html), even "simple" changes can have far-reaching consequences once you consider planner/executor, WAL, locking, and recovery interactions.

2) Process friction
	•	Contribution flows through CommitFest cycles. Each cycle sees hundreds of patches queued, but review capacity is limited.
	•	Committers are few and turnover is slow, so the review bottleneck is real: patches can wait, need multiple rounds, or be rebased repeatedly as the tree moves.
	•	Non-technical work—clear design notes, reproducible tests/benchmarks, responsive follow-ups—often determines whether a patch progresses.

3) What this implies for contributors
	•	You need the motivation to persist through long feedback loops, rework, and occasional rejection.
	•	Make reviewers’ lives easy: small, incremental patches, crisp Problem → Approach → Trade-offs → Tests → Perf notes, quick responses, and proactive rebases.
	•	Start with well-scoped fixes (observability, error messages, docs/tests) before larger architectural changes; build trust and momentum.

Bottom line: motivation matters first because PostgreSQL contribution is a marathon, not a sprint. If you find the work itself rewarding, you’ll be far more likely to push through the technical depth and the review bottlenecks that are simply part of the process.

## Setting Up Your Development Environment

Before you begin, ensure you have the necessary tools and libraries installed. PostgreSQL is written in C and can be developed on most Unix-like systems (Linux, *BSD, macOS) as well as on Windows. Most contributors use a Unix-like OS with the typical open-source development toolchain: a C compiler (e.g. GCC or Clang), GNU Make, GDB for debugging, Autoconf/Automake, etc.. On Windows, you can compile using MinGW or Microsoft Visual Studio (the project supports building with the MSVC toolchain). You will also need Git for version control, since PostgreSQL’s source code is managed in a Git repository.

Additionally, certain build dependencies are required:

- Flex (lexical analyzer generator) and Bison (parser generator) are needed to build the query parser.
- Perl (version 5.14 or higher) is used in the build process and test suite.
- Other common libraries like Readline (for psql command-line editing) and zlib (for compression support) should be installed as well unless you configure the build to omit them.

The official documentation’s installation requirements section provides a complete list of prerequisites for building PostgreSQL on various platforms.

In summary, get a working C development environment with the above tools and libraries, and you’ll be ready to start.

## Cloning the PostgreSQL Source Code and Compiling It

With your environment set up, the next step is to obtain PostgreSQL’s source code. While you can download released source tarballs, it’s recommended to work from the Git repository so that you have the latest development code and full project history. The PostgreSQL Git repository is publicly accessible – for example, you can clone it with the command: git clone https://git.postgresql.org/git/postgresql.git. This will create a local copy of the entire source history (it may take some time on first download). Regular contributors will periodically update their local copy (e.g. via git fetch) to stay in sync with the project’s master branch.

Once you have the code, building PostgreSQL from source is straightforward. PostgreSQL uses the GNU Autoconf build system (with support for Meson as an experimental alternative).

In the simplest case, navigate into the source directory and run the configure script, then make to compile. For example:

./configure        # auto-detect platform and set up Makefiles
make               # compile the code

This will compile the PostgreSQL server and all client applications and libraries. For a standard development build, you typically don’t need special options to configure; however, many contributors add the --enable-depend flag when running configure, which tells make to track header-file dependencies (so changes in header files trigger recompilation of affected source files). Compilation can take a few minutes, and will produce the postgres server binary and other tool binaries in the specified build directory or default locations. After a successful compile, it’s important to run the test suite to verify that everything works on your system. You can run the core regression tests with make check, which initializes a temporary test database and runs numerous tests to ensure the build behaves as expected. Running make check (or the more extensive make check-world for additional modules) is a good habit after any code change, to catch issues early. If the tests pass, you’ve confirmed your build is working, and you can also proceed with installing PostgreSQL locally (via make install) if you need to run the new binaries in a real environment. For development purposes, often running the binaries directly from the build directory or using make check is sufficient, but installation can be done in a separate prefix if needed.

Supported Platforms: PostgreSQL’s build process is primarily designed for Unix-like systems. These include Linux, many flavors of BSD, and others – generally if it’s POSIX-compliant, PostgreSQL can likely compile on it ￼. There is also support for Windows: the source tree includes project files and build scripts for Microsoft Visual C++ (supported versions have evolved; modern PostgreSQL supports recent MSVC versions). On Windows, you can either use the Visual Studio build or use MinGW/Microsoft’s build tools to compile from source ￼. The community provides documentation for Windows builds in the official manuals. Ensure you have the platform-specific prerequisites (for example, on Windows you might need Perl and a Windows SDK installed, etc.) as detailed in the documentation ￼ ￼. In all cases, refer to the “Installation from Source” chapter of the PostgreSQL documentation for any platform-specific notes and detailed instructions on the build process.

## Understanding the Codebase Structure and Key Components

PostgreSQL is a large project, but its source code is organized in a consistent directory structure.

Familiarizing yourself with this structure will help you navigate the codebase.

Most of the relevant code lives under the src/ directory of the repository. Key subdirectories include:

- `src/backend/`: This contains the database server (backend) code. It’s further divided into modules corresponding to subsystems of the server. For instance, `src/backend/parser/` holds the SQL parser, `optimizer/` has the query planner/optimizer, `executor/` contains the query execution engine, `commands/` implements DDL/DML command handling, `storage/` deals with how data is stored on disk and in memory, `utils/` contains various utilities (including cache management, error reporting, etc.), and so on. Each subdirectory often has a README file explaining its role – for example, `src/backend/access/` has README files for the table access methods. Reading these can give you insight into how each component functions ￼.
- `src/include/`: This holds header files for the server. The directory mirrors the structure of `src/backend` (so, for example, `src/include/executor/` corresponds to executor definitions). If you’re making changes to a backend module, you’ll likely be editing both a `.c` file in `src/backend/...` and its corresponding `.h` in `src/include/...`. Global definitions (like fundamental data structures, error codes, configuration constants) are also in `src/include/`. Keeping header files in sync with implementation is important; remember to run make with the `--enable-depend` configured so that header changes trigger rebuilds ￼.
- `src/bin/`: This directory contains source for command-line utilities and client applications. For example, the `psql` client is in `src/bin/psql/`, and other tools like `pg_dump` (backup utility), `pg_ctl` (server control script), and `initdb` (database cluster initialization) each have their own subfolders here. If your contribution affects user-facing tools or client-side logic, this is where those changes will go.
- `src/interfaces/`: This contains client library code, such as `libpq` (the C library for connecting to PostgreSQL). If you are working on how external programs communicate with PostgreSQL, or on procedural language handlers, you might be dealing with code under `src/interfaces/`.
- `contrib/`: This is a collection of optional modules that are packaged with PostgreSQL. These are additional features (extensions, utilities) maintained by the community. Examples include `hstore` (a key-value data type), `pg_stat_statements` (query tracking stats), and many others. If you write a new optional extension or tool, it might live in `contrib/`. Studying contrib modules can also serve as simpler examples of how certain features are implemented outside the core backend.
- `src/test/`: This holds test suites. `src/test/regress/` contains the core regression tests (which are mostly a series of SQL files and expected outputs). There are also subdirectories for more specific or advanced test suites, such as `src/test/isolation/` for testing concurrent behavior, and various TAP tests (written in Perl) under `src/test/perl/` or other `src/test/*` directories (for example, `src/test/recovery/` for replication and recovery tests). We will discuss testing in more detail later, but it’s useful to know where tests reside.

Apart from these, there are build system files (e.g. the GNUmakefiles in each directory), documentation source (under `doc/src/`), and other supporting files. Overall, the structure is logical: it separates the server’s functional areas and the various utilities. The official PostgreSQL developer documentation provides an ["Overview of PostgreSQL Internals"](https://www.postgresql.org/docs/current/overview.html) which walks through how a query flows through the system (from parser to planner to executor to storage). This can be very helpful for identifying which part of the code you might need to work with. Additionally, the PostgreSQL website offers a backend flowchart that visually outlines the backend architecture; it shows modules like Parser, Rewriter, Planner/Optimizer, Executor, etc., and you can click on components to see more details or jump to code and documentation.

Exploring these resources will give you a high-level understanding of PostgreSQL’s key components and how they interact (for example, how the parser outputs a parse tree which the optimizer then turns into a query plan for the executor) ￼ ￼.

In short, take some time to read the README files in various directories and the relevant chapters in the developer documentation. For instance, if you intend to modify the query planner, read the README in src/backend/optimizer and the “Planner/Optimizer” section of the internals documentation. If you plan to touch indexes, look at src/backend/access and its subdirectories (each index AM has its own code). This upfront investment in understanding the codebase structure and conventions will pay off when you start making changes.

## Reviewing Official Documentation and Developer Resources

PostgreSQL has a wealth of documentation for both users and developers.

As an aspiring contributor, you should familiarize yourself with the official developer documentation and community-maintained resources:

- **Core Project Documentation (Developer Sections):** The PostgreSQL manual itself contains sections aimed at developers. In the official docs (available on the website for each version), look for the "Internals" part of the documentation. This includes chapters like Overview of PostgreSQL Internals, System Catalogs, Frontend/Backend Protocol, Writing Instrumentation, and importantly the [PostgreSQL Coding Conventions](https://www.postgresql.org/docs/current/source-conventions.html) appendix. The Coding Conventions (often just called the "coding" guidelines) detail the required coding style, formatting, and best practices for PostgreSQL code. Reading these will help you write patches that adhere to the project’s standards. There’s also documentation on how to use Git with the PostgreSQL project (in Appendix I of the manual) and how the source code repository is organized ￼ ￼. Be sure to consult the “Developer FAQ” on the PostgreSQL wiki as well (more on that below), as it often points to relevant sections of the official docs for specific topics.
- **PostgreSQL Wiki – Developer FAQ and Guides:** The PostgreSQL community maintains a wiki with a lot of useful information for developers. A great starting point is the [Developer FAQ](https://wiki.postgresql.org/wiki/Developer_FAQ). This FAQ answers common questions about the development process, such as how to get the source, what tools are needed, how the code is structured, how to submit patches, etc. It's effectively a distilled knowledge base from long-time contributors. Another excellent wiki page is ["So, you want to be a developer?"](https://wiki.postgresql.org/wiki/So%2C_you_want_to_be_a_developer%3F) – a guide specifically written for new contributors that provides an overview of how to get started, explains the development workflow, and gives tips on navigating the community culture. The wiki also has pages for [Submitting a Patch](https://wiki.postgresql.org/wiki/Submitting_a_Patch), [Reviewing a Patch](https://wiki.postgresql.org/wiki/Reviewing_a_Patch), a TODO list of potential features, and more. For example, the Submitting a Patch page outlines the expectations and steps when you are ready to send your changes (from design considerations to email format). The Reviewing a Patch page is useful not only if you want to help review others' contributions, but also to understand what reviewers will be looking for in your patch. Browsing these resources can save you from common mistakes (and is often faster than learning solely by trial-and-error).
- **PostgreSQL "Developers" Section on the Website:** The main PostgreSQL website has a [Developers section](https://www.postgresql.org/developer/) (under the top menu) which aggregates many useful links for contributors. Here you'll find the development Roadmap and TODO list (to see upcoming and requested features), links to the Coding Guidelines and Testing information, the [CommitFest app](https://commitfest.postgresql.org/) (for patch tracking, discussed later), and mailing list information. Notably, this page will point you to the current commitfests and the developer FAQ on the wiki. It serves as a convenient hub for official development-related info. There’s also a link to a “Developers’ FAQ” and a direct link to join the developer discussions (like the mailing lists and even a community Discord server for hackers) ￼.
- **Mailing List Archives:** PostgreSQL’s development discussions occur on mailing lists (especially pgsql-hackers). The archives of these lists are public and searchable on the PostgreSQL site. Reading past discussions is incredibly informative. If you plan to work on a particular feature or bug, it’s wise to search the archives to see if it has been discussed or attempted before ￼ ￼. Many ideas have historical context – perhaps someone tried a similar patch 5 years ago and ran into obstacles that were discussed on the list. By digging into those archives, you can learn from past attempts and understand what concerns or design decisions were raised. The PostgreSQL wiki and TODO list often link to relevant archive threads for features, which can be a helpful starting point ￼. In short, treat the mailing list archives as part of the documentation – they are a rich record of the project’s collective knowledge and decision-making. The community expects new contributors to do some homework via the archives so that discussions don’t repeat the same points without acknowledgment ￼.
- **Books, Presentations, and External Resources:** Over the years, many PostgreSQL developers have given conference talks (e.g., at PGCon) and written articles about hacking the PostgreSQL code. The wiki page we mentioned (“So, you want to be a developer?”) actually lists some recommended talks and materials (like Neil Conway’s Introduction to Hacking PostgreSQL slides, Stephen Frost’s talks on hacking and patch review, Bruce Momjian’s How to be a hacker presentation, etc.). These can provide deep dives into specific areas or general advice on how to approach PostgreSQL development. While not “official documentation,” they are by respected community members and often linked from official sites, so they are worth checking out if you want more context or a different explanation of certain internals. There are also online books/resources, like The Internals of PostgreSQL (an independent project) and various blogs (e.g., by Peter Eisentraut or others), which cover particular internals. Prioritize the official docs and wiki first, but know that these external resources exist for supplementary learning.

To summarize, before you write a lot of code, spend time reading. Read the relevant parts of the manual (especially the developer-oriented parts), read the wiki guides (Developer FAQ, patch submission guidelines), and scan the mailing list archives for topics in your interest area. This will ensure you’re building on the community’s collective wisdom. It also shows respect for the project – long-time contributors will appreciate when a newcomer has clearly done their homework, which can make them more receptive to helping you.

## Participating in the PostgreSQL Developer Community

PostgreSQL's development is a community-driven process, and participating in the community is both essential and highly educational.

The primary avenues for interaction are the mailing lists, periodic CommitFests, and real-time chat. Here's how to get involved in each:

### Mailing Lists (pgsql-hackers and others)

The heart of PostgreSQL development discussion is the [pgsql-hackers mailing list](https://www.postgresql.org/list/). This is where patches are submitted and discussed, design proposals are debated, and general development issues are aired.

If you're serious about contributing, you should subscribe to pgsql-hackers and follow the conversations. Even as a lurker at first, you'll gain insight into the current priorities and the tone of discussion. When you're ready to contribute, you will be sending your patch or idea to this list, so it helps to observe how others do it.

PostgreSQL's mailing list culture might seem intense – discussions can be very technical and sometimes blunt – but remember it's focused on the code and technical merit (see the Code of Conduct and mailing list etiquette guidelines to understand the norms).

In addition to pgsql-hackers, there are other lists like pgsql-bugs (for bug reports) and pgsql-general (user Q&A) which can also be useful to join if you want to see what problems users are encountering. Helping answer user questions or analyze bug reports can be a gentle way to start contributing before diving into code, since it familiarizes you with common issues and usage patterns. But the hackers list is the primary forum for core development.

Make sure to read the list archives and any wiki FAQs about mailing list usage so you follow proper etiquette (e.g., avoid top-posting, trim replies, etc., as described in community guidelines). When you do start participating, introduce your ideas clearly and be receptive to feedback.

It's also wise to monitor the pgsql-hackers archives via the web if you don't want high email volume initially – you can always reply via email when needed (just ensure you keep the correct thread reference). In sum, subscribing to and reading pgsql-hackers is the way to plug into PostgreSQL development discussions and is highly recommended for all contributors.

### CommitFests

PostgreSQL uses a unique process called CommitFests to organize the patch review and commit workflow. A CommitFest is a focused period (generally one month long) during which the community concentrates on reviewing patches that have been submitted, with the goal of committing those that are ready.

There are typically several CommitFests during a development cycle (the PostgreSQL developers note around five CFs for a major release, often in July, September, November, January, and March). During a CommitFest, new feature development pauses, and committers and contributors work through the queue of patch submissions.

As a contributor, this means two things: (1) when you have a patch ready, you add it to the CommitFest app (a web application at commitfest.postgresql.org) so it gets in the review queue, and (2) you might be asked (or you can volunteer) to review others' patches as well.

The CommitFest app tracks the status of each patch (Needs Review, Ready for Committer, Returned with Feedback, Committed, etc.) ￼. It is open for anyone to register and use – you log in, select the upcoming or open commitfest, and "Add Patch" with details of your submission. You can also sign up to review a patch that's listed.

Anyone can participate in CommitFests, not just core team members. It's a fantastic way to get involved: even if you're new, you could try reviewing a small patch (for example, testing it out, checking if it does what it says, maybe reading the code for any obvious issues). This helps the community and also helps you learn the review process.

For patches you submit, the CommitFest structure helps ensure your patch will eventually get attention – a CommitFest manager is assigned to each CF to make sure patches have reviewers and don't languish without feedback ￼.

Keep in mind that if you submit a patch outside of a CommitFest, it might not get immediate review until the next CF begins (as many developers focus on their own patches or other work in between) ￼. Thus, timing your submissions around the CF schedule can be beneficial.

The PostgreSQL website's Developers section and the wiki will have the schedule for CFs and any instructions. In summary, CommitFests are the engine of PostgreSQL patch acceptance – get to know how to use the CommitFest app and be prepared to participate in that process by both submitting and reviewing. The official PostgreSQL site has a nice explanation of CommitFests and how they fit into the release cycle ￼.

### Discord for Real-Time Discussions

While decisions and formal discussions happen on the mailing lists, the community also offers real-time chat which can be helpful for quick questions or networking.

The PostgreSQL community has established a Discord server specifically for PostgreSQL hacking (development). In fact, the PostgreSQL Developers page invites new contributors to "Join the PostgreSQL Hacking Discord" ￼. Discord is a modern chat platform with channels for different topics.

This can be a great place to casually meet other contributors, find a mentor, or ask newbie questions that you might hesitate to email to pgsql-hackers. Discord is optional, but it provides a more immediate, interactive form of communication that can complement the slower-paced mailing lists.

Just remember that any important technical decisions or patch submissions must still go through the mailing list so there's a permanent public record. Use Discord to get unstuck or bounce ideas informally, but then move the conversation to the list if it turns into something substantive.

The PostgreSQL Discord is subject to the community Code of Conduct, just like the mailing lists, to ensure respectful interactions ￼. Don't be shy about joining – PostgreSQL developers are generally friendly and happy to help newcomers who show genuine interest.

### Community Culture Tips

When you start engaging, observe the cultural norms. PostgreSQL's community expects professionalism and respect, but also has a tradition of frank, technical debate. It can feel "blunt" at times, but don't mistake that for rudeness – it's usually about focusing on the technical issues.

Do take the time to read the PostgreSQL Code of Conduct and the mailing list etiquette guide ￼ ￼.

One practical tip: use clear subject lines on emails (and include relevant tags like "[PATCH]" or "[PROPOSAL]"), and when replying on mailing lists, do a "Reply All" to include both the list and the individual (PostgreSQL lists typically don't automatically reply-to-all) ￼ ￼. Little things like that help you integrate more smoothly.

Lastly, remember that becoming a contributor is as much about building relationships as it is about writing code – be patient, be willing to learn, and be helpful to others where you can. Over time, as you participate in discussions, review patches, and perhaps attend PostgreSQL events, you'll become part of the community's fabric.

## Writing, Testing, and Submitting Patches

When you've decided on something to contribute – be it a bug fix, a new feature, or an improvement – the workflow typically goes like this: code the change, test it thoroughly, create a patch (diff), and send it to the community for review. Let’s break down each part:

**Implementing Your Changes:** Code changes should begin with a clear goal and ideally consensus (for anything non-trivial). If your contribution is a simple bug fix or minor improvement, you might dive straight into coding. For larger changes or new features, it's wise to discuss the design on pgsql-hackers first (or at least be aware of prior discussions) ￼.

Assuming you have the go-ahead or a clear task, create a new Git branch for your work (this is good practice to keep your changes isolated). Implement the functionality in C (and/or SQL, etc., depending on the nature of the change). Try to follow the style guidelines (covered in the next section) from the start – it will make your life easier later.

As you develop, run the regression tests frequently to catch any breaks your change might cause. It's also a good idea to add new tests as you code, to verify that your feature or fix works as expected.

PostgreSQL has a strong testing culture: any new feature should come with regression tests that prove the feature works and continues to work in the future ￼ ￼. For example:

- If you add a new SQL syntax or alter behavior, add a `.sql` file under `src/test/regress/sql/` and a matching `.out` expected output file under `src/test/regress/expected/`, then include those in the Makefile so they run with `make check`.
- If writing C functions, you might also add tests in `src/test/regress` or in a new test script under `src/test/`.
- If appropriate, you can use the TAP framework (Perl-based tests) for more complex scenarios (like testing failover, background worker behavior, etc.).

Also, don't neglect platform testing – if you have access to different OSes or architectures, try building and running tests there, or at least flag if your patch is platform-specific and ask others to test on their systems ￼.

And of course, do basic performance checks if relevant: if your change could impact performance, benchmark it with and without the patch to ensure it's beneficial or at least not harming common cases.

**Preparing the Patch for Submission:** Once you believe your patch is ready – it implements the intended behavior, passes all tests (including new ones you wrote), and you've run through some code cleanup – it's time to prepare it for the mailing list.

The PostgreSQL project prefers patches in the form of textual diffs (unified diff format). The easiest way to generate this is using Git:

- If your changes are all in a branch `my_feature`, you can do: `git diff master my_feature > my_feature.patch` (assuming master is up-to-date with the latest community code).
- Even better, you can use `git format-patch` to create a series of commit patches if you have multiple commits – this includes commit messages.

The wiki suggests using `git format-patch` as a standard approach ￼, because it produces emails that can be applied with `git am`. If you use format-patch for a single commit, it will produce a `.patch` file with your commit message at the top, which is perfect for sending.

Review the diff yourself before sending – ensure that you didn't include any unintended changes. Common issues to look for:

- Stray debug printouts
- Changes in whitespace or indentation unrelated to your fix
- Code that was disabled with `#if 0`, etc.

A quick `git diff --check` will alert you to trailing whitespace or other whitespace errors in the patch. Clean those up, as such things are flagged by committers.

In short, self-review your patch diff as if you were the reviewer. The [Creating Clean Patches](https://wiki.postgresql.org/wiki/Creating_Clean_Patches) wiki page provides a "tour of boring trivia" on making the patch look good (e.g., updating catalog version if needed, running pgindent on your code, etc.) – it's worth a read if your patch is non-trivial.

**Writing a Patch Submission Email:** PostgreSQL patches are submitted by emailing the pgsql-hackers list. The email should include the patch as an attachment (or inline text – either is usually okay, but attachments ensure mail clients don't mangle the diff).

In the body of the email, explain the patch. A good patch email has a clear title (perhaps begin the subject with "[PATCH] …" and a short description).

In the email, write a cover letter or description that includes:

- What the patch does and why (the problem it solves or feature it adds)
- How you implemented it at a high level
- Any important details or implications (does it change disk format? does it add a GUC/config setting? etc.)
- The testing you've done (for example, "make check passes, and I added new tests for X") ￼ ￼

If it's a work in progress or you're seeking discussion, you can label it as "WIP" (Work In Progress) in the subject, which signals you're not expecting it to be committed as-is yet ￼. Conversely, if you think it's ready, you might say "for application" in the email.

Also mention the target branch – normally all patches are against the master (development) branch, unless it's a bug fix that might need back-porting to stable branches ￼.

The submission guidelines list a number of pieces of information to include in your patch email; for example, if your patch fixes a known item on the TODO list, say so, or if it has any performance impact, mention any measurements you have ￼ ￼.

In general, providing context helps reviewers. You want to make it as easy as possible for others to understand and test your patch. If your patch involves a new user-visible feature, don't forget documentation: include changes to the relevant SGML docs in the patch, and mention in the email that you've written docs ￼. Similarly, note that you included regression tests. Lack of tests or docs is a common reason patches are sent back ￼, so including them upfront marks you as a thoughtful contributor.

After composing your email and attaching the patch, double-check everything and send it to pgsql-hackers@postgresql.org. You do not need to be subscribed to send emails there, but if you aren't subscribed, you should monitor the archives or check if the thread appears (since list replies might not CC you directly in some cases). Usually, subscribing is easier.

Immediately after sending the email, add your patch to the CommitFest app (if a CommitFest is open or upcoming) ￼. This involves:

- Logging into the commitfest site
- Selecting the appropriate CF (e.g. "2025-11 CommitFest")
- Filling in the form (title, authors, a short summary, and attaching the patch file or linking to the mailing list thread)

The patch will then be visible in the commitfest queue for reviewers and committers ￼ ￼. If you forget this step, your patch might get overlooked until someone manually adds it or notices your email – so it's an important part of submission.

The general rule is: email to hackers for discussion; register in CommitFest for formal review.

A quick recap: Write clean code following style guidelines, test thoroughly (on multiple platforms if possible), produce a neat patch diff, write a clear explanatory email, send it to hackers, and register it in the commitfest. If you do all that, you’ve set the stage for a smooth review process.

## Following Coding Guidelines and Best Practices

PostgreSQL has a well-defined coding style and a set of best practices that contributors are expected to follow. This consistency is one reason the codebase remains high-quality despite many contributors. Here are the key guidelines and practices:
**Code Formatting:** PostgreSQL uses a specific indentation and brace style, inherited from BSD conventions. Indent with tabs set at 4 spaces – do not convert tabs to spaces (a tab is considered 4 columns in width) ￼. Each logical indent level is one tab. Braces for control structures (if/while/for) go on a newline of their own (not after the if statement on the same line) ￼. In other words, the project's style looks like:

```
if (condition)
{
    /* do something */
    for (...)
    {
        ...
    }
}
else
{
    ...
}
```

Comments should be in C-style /* ... */ (avoid C++ // comments, as those will be converted by pgindent) ￼. Block comments are formatted with a leading /* on its own line, asterisks at the start of each line inside, and closing */ on its own line ￼. There's an example in the coding conventions showing the preferred multi-line comment style. Also, limit line lengths to keep code readable in an 80-column window. It's not a hard limit (sometimes long strings or format constants might exceed 80), but use your judgment to break lines for readability ￼. The rule of thumb is that your code shouldn't look wildly different from surrounding code – if it does, you probably need to adjust formatting.

**Naming Conventions:** PostgreSQL doesn't enforce one naming style globally (you'll see CamelCase in some places and lowercase_with_underscores in others). The guideline is to match the style of the surrounding code or the subsystem you're working in ￼. For example, in the parser and executor, many variables and functions use CamelCase (e.g., MaxHeapTupleSize or ExecQual), whereas in other areas you might see lowercase with underscores. Follow whatever convention that module uses so that your new code blends in ￼. Consistency within a given context is valued more than consistency across the entire codebase ￼. If you introduce new functions or GUC parameters, choose clear names that align with existing naming patterns. When in doubt, ask or look at similar code for precedent. Also, avoid overly abbreviating names – clarity is preferred.

**General C Best Practices:** Always check for memory allocation errors (though in PostgreSQL code, allocations with palloc will throw an error on out-of-memory, so usually no need to check its result). Free memory in error paths appropriately (or use PG_TRY/PG_CATCH blocks if needed for resource cleanup). Use ereport/elog for error reporting rather than fprintf or custom logging (the Developer FAQ and coding conventions document detail how to report errors correctly, including internationalization considerations) ￼ ￼. Don't use C99 // comments or other non-portable compiler extensions unless explicitly allowed. Stick to SQL-standard behaviors unless you have a reason to deviate. In summary, follow the lead of existing code for how to handle common tasks (memory, errors, string handling, etc.). There are also specialized internal APIs (like List for linked lists, elog for logging, palloc for memory) – get to know them instead of using libc malloc/free or creating your own list structures.

**In-Code Comments and Clarity:** Write comments to explain the why and any non-obvious what of your code. Do not leave commented-out code blocks (if something should be removed, remove it rather than commenting it out). Don't mark your changes with special comments – for example, avoid /* XYZ change begins */ type markers. The code should look as if it was always written that way, not annotated with who added what ￼. If you need to draw attention to something for the reviewer, do it in the commit message or patch email, not as a permanent in-code comment. Also, follow the project's comment style: full sentences starting with a capital letter, etc., for block comments; and use descriptive phrasing. If your code is complex or uses an algorithm that isn't obvious, a comment explaining the approach is very welcome. But avoid comments that just restate what code does line-by-line – assume the reader knows C, and focus on higher-level clarification or rationale.

**No Superfluous Changes:** A crucial best practice for patches is to keep them focused. Do not include unrelated cosmetic changes (like reindentation of code you didn't otherwise modify, or renaming variables that don't need renaming) ￼. The project has a tool called pgindent that the core team runs periodically to clean up formatting, so you don't need to fix formatting in code unrelated to your change – in fact, doing so can cause your patch to be rejected or at least annoy reviewers ￼. Similarly, don't bundle multiple independent changes in one patch; if you have a refactor and a feature, submit them separately. Each patch should be as small as possible while still "complete" in what it's meant to do ￼. This makes reviewing much easier.

**Use pgindent and other tools:** The source tree provides src/tools/pgindent which is used to auto-format code according to PostgreSQL standards (it uses an indent tool with a custom profile). It's not mandatory to run pgindent on your patch (and indeed it might reformat a lot of things), but if your code is significantly mis-indented, maintainers might ask you to run it. At minimum, ensure spacing and tabs are correct and consistent. Also, use make check-world to run all tests, make installcheck to test against an existing instance if needed, and consider using valgrind or AddressSanitizer to catch memory errors if you touch low-level code. The Developer FAQ encourages things like running make installcheck, using EXTRA_REGRESS tests, etc., when appropriate ￼ ￼. For debugging, you can compile with --enable-debug and use GDB; the FAQ and wiki have tips for debugging the backend (like attaching to processes, using errfinish breaks, etc.) ￼ ￼ – those are beyond our scope here, but know that you have options to help verify your code's correctness.

**Adherence to Project Conventions:** It's strongly recommended to read the official PostgreSQL Coding Conventions document in the manual ￼. It covers all the things above in more detail (formatting, error message style, etc.), and also notes some "don't do this" items. For example, error messages have a style guide (use complete sentences, no trailing punctuation, etc.) and there is guidance on translating user-facing messages. By following these conventions, you make it easy for committers to accept your patch without a lot of rework. If your patch doesn't follow the conventions, reviewers will likely point that out and ask for revisions, or in some cases, they might just reject the patch until you clean it up ￼. The good news is that once you're familiar with these standards, they become second nature. Many contributors set up their editors with PostgreSQL style settings (the src/tools/editors/ directory even contains sample configs for Emacs and Vim to enforce 4-space tabs, etc.) ￼.

In summary, make your changes look like they seamlessly belong in PostgreSQL. Write code that is stylistically identical to existing code around it ￼. The project maintainers run automated formatting (pgindent) at the end of the release cycle, so any minor deviations will eventually be adjusted – but it saves everyone time if your code already meets the standard. A helpful mindset is: pretend that a future reader of your code is a very grumpy version of yourself – write it so clearly and cleanly that even grumpy-you couldn’t find fault with it! Following the project’s coding guidelines will not only increase the chances of your patch being accepted but also earn you the respect of reviewers who see that you’ve taken the time to do things the “PostgreSQL way.”

## Getting Reviews and Feedback on Your Contributions

After you've submitted your patch to the mailing list and added it to a CommitFest, the next phase is the review process. This is where your contribution is scrutinized by others – an essential step for quality control. Here's what to expect and how to navigate it:

### The Patch Review Cycle

Once your patch is in the commitfest queue, one or more community members will (hopefully) pick it up for review. A reviewer might be another volunteer contributor or a PostgreSQL committer. They will read your code, test it, and provide feedback on the mailing list thread associated with your patch.

The feedback could range from simple ("this compiles and the tests pass, looks good") to extensive ("here are 10 issues:…") depending on the patch's complexity and quality. Don't be discouraged by critique – very few patches are accepted without revision. In fact, the project expects that even experienced developers will go through several patch versions for anything non-trivial ￼.

The review might uncover bugs, point out coding style issues you missed, question the approach or design, or even raise broader architectural concerns. This is normal. If the feedback is that your patch needs work ("Returned with Feedback" in commitfest terms), then it's on you to address the comments and submit a revised patch (see "Submitting patch updates" below).

If the patch is acceptable, a committer may mark it "Ready for Committer" and then proceed to do final checks (possibly additional testing or minor edits) and commit it to the codebase. Or, a committer might directly pick it up and commit it (this is less common for larger patches without some review first).

In any case, every patch goes through community review – it's a collaborative process. The Developer FAQ summarizes this: once submitted, your patch "will be reviewed by other contributors to the project and will be either accepted or sent back for further work" ￼. The committers want to see that the patch is correct, doesn't break anything, fits PostgreSQL's design principles, and has community agreement for inclusion.

### Responding to Feedback

When you receive feedback, respond in a timely and thoughtful manner. If a reviewer asks questions or requests changes, you should either explain why you did something (if you believe it was misunderstood) or acknowledge the point and plan to fix it. It's okay to discuss solutions on the mailing list – in fact, that's encouraged. Sometimes a reviewer might say "I don't think this approach will work because of X; maybe consider Y." You can reply and have a discussion to reach consensus on what to do.

Be receptive, not defensive. Remember that reviewers are investing their time to help improve your patch. Even if you disagree with some critique, remain professional and focus on the technical merits. Often, reviewers are right (or at least raise valid issues), and even if not, a polite technical explanation from you can clear up the matter.

Once you've addressed feedback, you'll need to submit an updated patch version. Typically, you'd incorporate all the changes, test again, then generate a new diff. In your reply email, attach the new patch (or a series, if using git format-patch with versions) and make it clear this is a v2 or v3 of the patch. It's helpful to include a changelog of what you changed since the last version.

The wiki suggests using `git format-patch -v2` which labels the patch filename as v2, v3, etc., and to ensure you link to the previous discussion so reviewers can easily find context ￼ ￼. Each new version should also be updated in the CommitFest app (you can add a new patch file there or mark the old one superseded).

This iterative process continues until the patch is either committed or ultimately rejected. Don't be disheartened by multiple rounds – it's common. For a new contributor, it's also common that your first patch might be something small or might go through several revisions, and that's okay.

### Getting Attention for Your Patch

The PostgreSQL project gets a lot of patches, and reviewers are all volunteers. Sometimes a patch doesn't get reviewed promptly. The CommitFest helps, but even then, some patches risk slipping through cracks if there are many submissions. If you find your patch languishing without review for a while, there are a few things you can do:

First, ensure you registered it in the CommitFest (as mentioned). That's step one ￼.

During a CommitFest, if your patch is still not reviewed and it's near the end, you might gently remind the CF manager or ask on the list if someone could take a look. Outside of CommitFest, you could post a polite follow-up on your thread (or in a weekly summary thread, sometimes maintainers ask "has anyone overlooked a patch that needs review?").

A proactive strategy is to engage by reviewing others' patches. The PostgreSQL community operates on a sort of mutual aid principle: if you help review, others are more inclined to review your patches ￼. In fact, there's an informal expectation that patch authors also do some reviews (often phrased as "each patch submitter is expected to review at least one other patch in that CommitFest") ￼. By doing this, you build goodwill and also learn the review process. Reviewing doesn't have to mean giving an in-depth critique if you're new; it can be as simple as applying the patch, running tests, and reporting back "I tested this on my machine and it works / doesn't work, and here are some comments." This is extremely helpful to the community and often accelerates the overall CommitFest progress.

Another tip from community members: if you're new, start with a small, uncontroversial patch ￼. Patches that fix a clear bug or add a minor improvement are more likely to get quick attention and be committed, which gives you a success experience and familiarity with the process. Big feature patches from unknown contributors might take longer to gain traction (not always, but generally). So building up with a few small contributions can establish your reputation.

As the wiki says, "People are more willing to listen and work with someone who is already contributing." ￼ This means being active in the community (reviews, discussions) can indirectly help your patches too.

### Handling Rejection or Extensive Revisions

It's possible that a patch is outright rejected or deferred. Maybe the idea needs more work, or the approach isn't suitable. The CommitFest might mark it "Returned with Feedback" if it's not in a committable state by the end of the CF. If this happens, don't be discouraged. Read the feedback carefully – it often contains suggestions for what to try next or how to redesign.

Sometimes a patch is returned simply due to time constraints or because it needs to wait for a better time in the release cycle. You can improve it and resubmit for a future CommitFest. Persistence pays off, as long as you're addressing the feedback.

Also, if your patch addresses a long-standing issue or a TODO item, and it gets rejected for some reason, consider writing up what you learned on the wiki or mailing list for future reference, and maybe tackling something else in the meantime. Not every idea will land, but the process of trying and getting feedback is valuable.

### Learning from Reviews

Every review is a chance to learn more about PostgreSQL and coding in general. Core developers might share insights about why a certain approach is needed, or point out pitfalls (like thread-safety concerns, or how a change might break replication, etc.) that you hadn't thought of. Take this knowledge to heart – it will make your future contributions stronger.

Over time, you'll internalize many of the project's idioms and expectations, and the review feedback on style or minor issues will diminish. Even long-time contributors get reviews with suggestions; it's a continuous learning process for everyone. The PostgreSQL community aims to ensure all committed code meets high standards, and that requires even veterans to sometimes adjust their patches per others' input.

### Stay Professional and Patient

It's worth emphasizing the human aspect: always keep discussions technical and avoid personalizing things. If a reviewer is terse, don't immediately assume hostility – they might be busy or not a native English speaker, etc. If you're unsure what a feedback comment means, it's fine to ask for clarification. When you post a new patch version, thank those who reviewed the previous one. This kind of courtesy helps build a positive rapport.

Also, be patient. Sometimes, especially towards the end of a development cycle, committers may be busy with releases or other duties. Your patch might roll over to the next CommitFest. This can be frustrating, but it's also common; just use the time to possibly refine it further or respond to any late comments.

In essence, getting your patch committed is usually an iterative collaboration with the PostgreSQL community. It might take multiple months or CommitFests for bigger contributions. But when it does make it in, you'll know that it has passed rigorous review – which is a rewarding feeling. And you'll have likely made connections with other developers along the way. Remember, the goal of reviews is to maintain PostgreSQL's quality, not to criticize you personally. The community really does appreciate contributions, especially from new folks who are patient and willing to work through the process.

(On a final note, if you find that no one responds at all to your patch email after a reasonable time (say, a week or two outside a commitfest), you can send a follow-up on the thread or politely ping the mailing list to draw attention. Sometimes patches get lost in the noise. Just do so respectfully – e.g., "Just following up on this patch. Any feedback would be appreciated." Often someone will then notice it.)

## Reviewing Patches: Learning While Contributing

One of the most valuable yet underappreciated ways to contribute to PostgreSQL is through patch review. While we've mentioned reviewing as a way to get attention for your own patches, it deserves deeper discussion as a contribution strategy in its own right. Reviewing patches accelerates your learning, moves the project forward, and often reveals opportunities for future work—making it one of the fastest, most sustainable paths into PostgreSQL development.

**Why Review?** Reading real changes lets you to explore specific subsystems, reason about design trade-offs, and spot integration issues—exactly the kind of hands-on familiarity that translates into writing good patches yourself. When you dig into a patch, you need to explore that part of the codebase actively, question why things are done a certain way, and consider how the change fits with the rest of the system ([Craig Kerstiens, "Contributing to Postgres via patch review"](https://www.citusdata.com/blog/2018/03/31/contributing-to-postgres-via-patch-review/)). That kind of hands-on inspection builds familiarity and often surfaces subtle oddities that might otherwise be overlooked. Moreover, the project desperately needs reviewers: CommitFests regularly queue hundreds of patches, while committer and reviewer bandwidth is limited. Your review work directly reduces the bottleneck and helps ensure quality patches get committed faster.

**Where to Find and How to Sign Up:** Reviews happen through the [CommitFest application](https://commitfest.postgresql.org/). Pick a patch that interests you and sign yourself up as a reviewer in the app. You don't need permission—just pick something and start. The CommitFest manager can help if you're unsure what to choose. Please sign up as soon as you know you'll review (don't wait until after you've finished), so the community can plan reviewing resources. Initial reviews should be sent within about five days, though it's fine to send a partial review or request more time—just keep communicating. Send your review as a reply to the original patch email on the [pgsql-hackers mailing list](https://www.postgresql.org/list/), maintaining the email thread so the author sees your feedback ([PostgreSQL Wiki: Reviewing a Patch](https://wiki.postgresql.org/wiki/Reviewing_a_Patch)).

**A Practical Review Workflow:** The PostgreSQL wiki breaks reviews into phases—submission, usability, feature, performance, coding, architecture—which provides a useful mental checklist as your reviewing skills grow. Here's a practical progression from simple to comprehensive:

1. **Build & Run:** Pull the patch, apply it to current master, build with `--enable-cassert` and `--enable-debug` (these catch many issues but make the build slower), and run `make check`. For bigger features, add your own targeted functional checks or micro-benchmarks to verify the claims.

2. **Usability/Feature Check:** Does it do what it claims? Try to use the feature as an end user would. Are error messages clear and helpful? Is the CLI or SQL surface consistent with similar existing features? Does it follow SQL standards where applicable? This level of review requires no deep C knowledge—just the ability to test and think about user experience.

3. **Performance Sanity:** Look for obvious hot-path costs (unnecessary allocations, O(n²) algorithms where O(n) would work). Check for polling loops vs. proper latch or condition-variable waits. Watch for unnecessary memory copies. If the patch claims performance improvements, try to verify them; if it touches a hot path, check that it doesn't regress common queries. You don't need to be a performance expert—just apply common sense and basic profiling.

4. **Coding & Architecture:** Compare the code to PostgreSQL's [coding conventions](https://www.postgresql.org/docs/current/source-conventions.html). Check for portability issues (will it work on BSD, Windows, different compilers?). Consider concurrency: does it properly handle locking? Think about WAL, replication, and recovery: will this change break streaming replication or point-in-time recovery? Consider upgrade and compatibility: does it maintain backward compatibility where needed? Does it handle catalog version changes correctly? As you gain experience, you'll develop intuition for these architectural concerns.

5. **Tests & Docs:** Verify that tests exist and cover edge cases. Check that documentation has been updated—patches without docs are often sent back as "WIP." If tests or docs are missing, explicitly call that out in your review.

**What a Helpful Review Looks Like:** A good review provides actionable feedback with evidence. Include reproduction steps: exact commit/branch, build flags, commands run, results observed. Organize findings by category (behavior issues, performance concerns, code quality, missing tests/docs), each with evidence or a small reproducer. Offer concrete suggestions: naming improvements, edge cases to test, alternative API designs, potential risks or trade-offs. Be specific and courteous in tone. Finally, state your conclusion: do you think the patch is ready for committer-level review, or does it need more work? What specifically needs to be addressed?

For more techniques and examples, see Craig Kerstiens' ["Contributing to Postgres via patch review"](https://www.citusdata.com/blog/2018/03/31/contributing-to-postgres-via-patch-review/), the [Reviewing a Patch wiki page](https://wiki.postgresql.org/wiki/Reviewing_a_Patch), and various conference talks on the subject.

**How to Pick Good First Reviews:** If you're just starting with PostgreSQL internals, begin with small, self-contained fixes—documentation clarifications, improved error messages, observability enhancements, or minor bug fixes. These let you learn the review workflow without drowning in complexity. For larger feature patches that span multiple releases, you can review a specific module or phase; you'll often spot unfinished edges or "to-do" items worth tackling yourself. Occasionally, you'll encounter a patch that opens up a whole new area (like when async I/O was introduced); use that review as an opportunity to map the subsystem and capture follow-up ideas. Reviewing is a reliable way to generate future work and discover what needs doing next.

**The Fractal Nature of Knowledge:** As Paul Graham once observed, knowledge expands fractally: from a distance its edges look smooth, but once you learn enough to get close to one, they turn out to be full of gaps. Patch reviewing is the perfect embodiment of this principle. Each review reveals new corners of the codebase, raises questions about why certain trade-offs were made, and exposes opportunities for improvement. What seems like a simple three-line change might touch on query planning, catalog access, memory contexts, and error handling—and reviewing it forces you to understand all those intersections. That cumulative knowledge is what eventually transforms you from someone learning PostgreSQL to someone who can confidently design and implement features.

**Bottom Line:** Patch reviewing builds deep codebase fluency, directly helps committers and the project, and surfaces high-leverage contribution opportunities. Many of today's PostgreSQL committers started their journey by reviewing patches, learning the ropes one review at a time. It's one of the most effective ways to become a trusted contributor, and the community will remember and appreciate your reviewing efforts when you submit your own patches later. Don't wait until you feel "expert enough"—start reviewing, and the expertise will follow.

## Contributing to Documentation and Testing

Code is not the only way to contribute to PostgreSQL's development. Documentation and testing are crucial parts of the project, and contributions in these areas are very much welcomed by the community. In fact, the project often encourages new contributors to start with documentation improvements or test cases, as these can be a great way to familiarize yourself with the codebase and review process.

### Improving Documentation

PostgreSQL's documentation (the user manual) is extensive, but there's always room for improvement – whether it's clarifying a confusing explanation, adding an example, fixing mistakes, or documenting new features.

The documentation is written in DocBook (XML) format, located in the `doc/src/sgml/` directory of the source. If you see something in the docs that is incorrect or could be better, you can submit a patch for that just like for code. The community even has a dedicated mailing list, pgsql-docs@postgresql.org, for discussing documentation changes ￼ ￼. You can send documentation patches there or to pgsql-hackers (either is fine; hackers is appropriate if the doc patch is tied to code changes or if you want a broader audience).

Documentation patches should follow the style of the rest of the docs and ideally maintain consistency in tone and formatting. If you're adding a new feature, you must update the relevant SGML files as part of your patch ￼ – patches that add functionality without docs will not be committed (they'll be considered "WIP" at best) ￼.

When you write docs, build them to make sure they format correctly (the docs can be built with `make world` or specifically `make docs`, given you have the DocBook toolchain installed; see Appendix J of the documentation for how to build the docs) ￼ ￼.

Even if you're not contributing code, you can help by proofreading documentation: many pages could use clearer wording or more examples. The PostgreSQL documentation is known for quality, and that's because many people (not just core developers) pitch in to refine it. If writing is a strength of yours, consider reviewing the docs and submitting patches to pgsql-docs – the community will greatly appreciate it. Copy-editing, fixing typos, improving grammar, updating outdated info – all these are valuable contributions. The wiki and mailing list will happily guide you if you're unsure how to format a doc patch. There's also a "Documentation TODO" in the commitfest or wiki sometimes, listing areas that need work.

### Adding Tests and Continuous Testing

PostgreSQL relies on its regression test suite to catch issues. Contributing to testing can mean a few things:

**Writing new regression tests:** Perhaps you noticed that a certain SQL command isn't covered by any existing test, or you want to add tests for a module that you're interested in (e.g., testing more edge cases in the JSON functions). You can write additional test files and submit them as patches. This can strengthen PostgreSQL's test coverage over time.

Often, when a bug is fixed, a regression test is added to ensure it doesn't recur; if you find a bug, writing the test that exposes it (even before a fix exists) is a contribution in itself. The community has guidelines for writing regression tests (for SQL tests, generally you add a new `.sql` file and an `.out` file and possibly update the parallel schedule in `serial_schedule` or `parallel_schedule`).

There's also a newer TAP test framework (under `src/test/`) which uses Perl and the Test::More library, which is used for more procedural or multi-node testing (like testing replication, failover, CLI tools, etc.). If you're comfortable with that, you can add TAP tests as well. When submitting tests, treat them like code patches: include what the test is for and ensure they pass. Patches that only add tests (e.g., increasing coverage) are generally very welcome and easy to review.

**Testing Patches (Reviewing):** As mentioned in the community section, simply helping to test others' patches is a form of contribution. You don't have to be the author; by building with a patch and running `make check` or doing some manual testing of a feature and reporting results, you are contributing to the quality assurance process.

**Build Farm and Cross-Platform Testing:** PostgreSQL has a distributed [Build Farm](https://buildfarm.postgresql.org/) – a network of machines that continuously build the latest PostgreSQL code on various platforms and run the test suites. If you have access to a platform that's not widely covered (or even if it is), you can join the build farm by setting up a client (see the [PostgreSQL Buildfarm Howto](https://wiki.postgresql.org/wiki/PostgreSQL_Buildfarm_Howto)). This helps detect platform-specific issues.

Even if you're not running a build farm member, paying attention to build farm reports is useful. When you submit a patch that gets committed, the build farm will test it on dozens of environments. If something fails, you might need to help fix it. So being aware of how to interpret build farm results is good (the build farm has a public status page). Contributing to testing can be as simple as checking build farm logs and pointing out "hey, my patch caused a failure on OpenBSD – I'll investigate that." The community appreciates such initiative.

**Beta Testing:** PostgreSQL releases beta versions of major releases for the community to test. Participating in beta testing – running the beta in your environment, trying new features, and reporting bugs – is a way of contributing to the quality of the release. While this is more on the user side than developer side, it overlaps: sometimes beta testing reveals issues that require patches. If you report a bug during beta and perhaps even suggest a fix, that's a direct development contribution. The PostgreSQL Developers page has links for Beta information and how to get involved in testing release candidates ￼ ￼.

### Why Documentation and Testing Matter

In summary, don't overlook docs and tests. The PostgreSQL Global Development Group values these contributions highly. There is even a saying in open source: "documentation patches welcome" – meaning instead of complaining about missing docs, you can write them.

By contributing documentation improvements, you make PostgreSQL easier to use for everyone (and you demonstrate a thorough understanding of the feature, which reflects well on your expertise). By contributing tests, you help ensure PostgreSQL remains reliable and that future changes don't unknowingly break things.

Plus, working on docs or tests is a great entry point to the contribution workflow: you still go through patch submission and review, without the pressure of C code intricacies. Many new contributors have started by fixing a small typo or adding an example to the docs, and then moved on to code changes once they got comfortable with the process.

Finally, a practical note: when submitting documentation patches, follow the style (use the same markup, etc.), and when submitting test patches, ensure the tests fail before your code change (if you're also supplying a code fix) and pass after – that proves the test's validity. If you're contributing tests independent of a specific bug fix, ensure they all pass on the current master branch (you don't want to introduce a failing test with no fix – unless your goal is to highlight a bug to be fixed). Usually, tests are added together with fixes. Standalone test improvements should obviously not fail on current code.

⸻

## Conclusion

Contributing to PostgreSQL development involves more than just writing code – it’s about engaging with a mature community process. By setting up the right environment, understanding the code structure, reading the documentation, communicating on mailing lists/IRC, adhering to coding standards, and being diligent with testing and documentation, you’ll set yourself up for success. PostgreSQL has been around for decades, and it has a reputation for stability and performance – this is largely thanks to the careful review and contributions of its developer community. As a new contributor, you’re encouraged to start small, learn continuously, and gradually take on bigger challenges. Every contribution, whether a typo fix in the docs or a major new feature, goes through the same fundamental steps outlined above. The tone and thoroughness of this process might seem daunting at first, but many find it a highly rewarding experience – you get to collaborate with very knowledgeable developers and ultimately see your work become part of a world-class database system.

Good luck with your journey into PostgreSQL development! The community is always looking for new contributors, and by following this guide and the linked resources, you’ll be well on your way to making meaningful contributions. Remember that every PostgreSQL expert was once a beginner – persistence, openness to feedback, and a passion for the technology will serve you well. We look forward to your patches!

Each of these resources is rich with detail beyond this guide, and you are encouraged to consult them as needed. Happy hacking in PostgreSQL!

## References

### Market and Adoption
- Gartner. "AWS, Oracle, Google, Microsoft Top Cloud DBMS Market" (2024). <https://www.crn.com/news/cloud/2024/aws-oracle-google-microsoft-top-cloud-dbms-market-gartner>
- Adrian, Merv. "DBMS Market 2023: More Momentum Shifts" (2024). <https://www.linkedin.com/posts/mervadrian_dbms-market-2023-more-momentum-shifts-activity-7202356872757039104-oT8v>
- Stack Overflow. "Developer Survey 2024 – Databases." <https://survey.stackoverflow.co/2024/technology>
- DB-Engines. "PostgreSQL is the DBMS of the Year 2023." <https://db-engines.com/en/blog_post/106>
- DB-Engines. "DB-Engines Ranking" (Monthly). <https://db-engines.com/en/ranking>
- Fastware. "Why PostgreSQL is the Linux of Databases." <https://www.postgresql.fastware.com/blog/why-postgresql-is-the-linux-of-databases>
- Feng Ruohang. "Postgres Is Eating the Database World." <https://medium.com/@fengruohang/postgres-is-eating-the-database-world-157c204dcfc4>

### PostgreSQL Official Documentation
- PostgreSQL. "Installation from Source" (Chapter 17). <https://www.postgresql.org/docs/current/installation.html>
- PostgreSQL. "Overview of PostgreSQL Internals." <https://www.postgresql.org/docs/current/overview.html>
- PostgreSQL. "PostgreSQL Coding Conventions." <https://www.postgresql.org/docs/current/source-conventions.html>

### PostgreSQL Wiki and Community Resources
- PostgreSQL Wiki. "Developer FAQ." <https://wiki.postgresql.org/wiki/Developer_FAQ>
- PostgreSQL Wiki. "Submitting a Patch." <https://wiki.postgresql.org/wiki/Submitting_a_Patch>
- PostgreSQL Wiki. "Reviewing a Patch." <https://wiki.postgresql.org/wiki/Reviewing_a_Patch>
- PostgreSQL Wiki. "Creating Clean Patches." <https://wiki.postgresql.org/wiki/Creating_Clean_Patches>
- PostgreSQL Wiki. "So, You Want to be a Developer?" <https://wiki.postgresql.org/wiki/So%2C_you_want_to_be_a_developer%3F>
- PostgreSQL Wiki. "PostgreSQL Buildfarm Howto." <https://wiki.postgresql.org/wiki/PostgreSQL_Buildfarm_Howto>

### Patch Review Resources
- Kerstiens, Craig. "Contributing to Postgres via patch review" (2018). Citus Data Blog. <https://www.citusdata.com/blog/2018/03/31/contributing-to-postgres-via-patch-review/>
- Haas, Robert. "Hacking on PostgreSQL is Really Hard" (2024). <https://rhaas.blogspot.com/2024/05/hacking-on-postgresql-is-really-hard.html>

### PostgreSQL Development Infrastructure
- PostgreSQL. "Developer Portal." <https://www.postgresql.org/developer/>
- PostgreSQL. "CommitFest Application." <https://commitfest.postgresql.org/>
- PostgreSQL. "Build Farm." <https://buildfarm.postgresql.org/>
- PostgreSQL. "Community IRC." <https://www.postgresql.org/community/irc/>
- PostgreSQL. "Mailing Lists." <https://www.postgresql.org/list/>