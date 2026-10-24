# Backend email configuration

Password reset approval codes are sent to the email address on the employee's
account. Configure Django's SMTP backend in `backend/.env` before admins
approve reset requests. The console email backend is the development default
and does not deliver messages to inboxes; approvals are rejected while that
backend is active.

Set these values for the SMTP provider:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-smtp-username
EMAIL_HOST_PASSWORD=your-smtp-password
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
EMAIL_TIMEOUT=10
DEFAULT_FROM_EMAIL=StockPilot <no-reply@example.com>
```

Use credentials from your mail provider, keep `.env` private, and choose TLS or
SSL according to that provider's SMTP settings. Each approval code expires
after 15 minutes and is sent only once.
