# FAQ

Frequently asked questions about R's DocManager.

## General

### What is R's DocManager?

An AI-powered document management platform with multi-organization support, role-based access control, document viewers, reviewer workflows, and encrypted API key storage. The full name is Rohan's DocManager.

### Is it free?

The platform is open source. AI features require API keys from providers like Groq (free tier available), OpenAI, or Anthropic. Local tools (word count, structure analysis, preview) work without any API key.

### What does R stand for?

Rohan. The application is named after Rohan Sharma, built by Rohan Sharma.

## Documents

### What file formats are supported?

PDF, DOCX, DOC, TXT, CSV, Markdown, HTML, JSON, XLSX, PPTX, RTF, and ODT. Maximum file size is 50 MB.

### Is text automatically extracted from uploaded files?

Yes, for DOCX, TXT, MD, HTML, JSON, RTF, and ODT files. PDF files are displayed in an embedded viewer but text is not extracted during upload. Legacy uploads before the extraction feature was added will show a "No text content available" notice with a download button.

### Can I create documents without uploading?

Yes, use the Write mode with the built-in Markdown editor. You can also import text from files using the RAG Import button.

### How do I password-protect a document?

Toggle the password option when creating a document. Set a 9-digit numeric code. Users will need to enter it to view the document.

### Can I share documents across organizations?

Regular users cannot. God-role users can create documents in multiple organizations at once. Setting "All Orgs" inserts a copy in each organization.

### What is the difference between classification and access level?

Classification controls who can see the document (Organization, Public, Internal, Confidential, General). Access level controls what viewers can do with it (View Only, Comment, Edit, Full Access).

### What happens when I set a document to View Only?

The Comments button is hidden entirely. Users can only read the document content. They cannot post comments.

### Who can be selected as a reviewer?

Only Admins and Super Admins from your organization can be assigned as reviewers. Users cannot be reviewers.

### How do document references work?

When creating a document, click "Link Documents" to select related documents from your organization. Referenced documents appear as links in the document detail sidebar.

## Deletion

### Who can delete my documents?

Only users who outrank your role can delete your documents. Admins can delete User docs. Super Admins can delete User and Admin docs. God can delete any public document.

### What happens when a document is deleted?

The document record and any uploaded file in storage are both removed permanently.

## AI Features

### Which AI provider should I use?

Groq for free and fast results. OpenAI for highest quality. Anthropic for long documents.

### Are my API keys safe?

Yes, encrypted with AES-256-GCM. Even database administrators cannot see your raw keys.

### Does the app store AI responses?

No. AI responses are displayed in your browser and not stored in the database.

### What are the free local tools?

Word Count (words, characters, sentences, paragraphs), Structure Analysis (headings and key phrases), and Text Preview (first 500 characters). These run entirely in the browser with no API key needed.

## Roles

### What role do I get when I sign up?

All new users start with the User role (weight 10).

### Who can change my role?

Super Admins can promote you up to Admin. God users can assign any role.

### What is the default classification for each role?

God defaults to Public with Comment access. Admin, Super Admin, and User default to Organization classification.

## See also

- [Pages](pages.md) — full guide to the Notion-style pages feature
