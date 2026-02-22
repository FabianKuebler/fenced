This skill provides Gmail access for reading and sending emails.

Functions:
- `searchMail(query, maxResults?)` - search emails using Gmail syntax (e.g., `is:unread`, `from:someone@example.com`)
- `getMessage(messageId)` - get full message details
- `getThread(threadId)` - get all messages in a thread
- `sendMail({ to, subject, body, cc?, bcc? })` - send an email
