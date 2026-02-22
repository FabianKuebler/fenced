Sure! I'll compose a Christmas message to Nona. I'm looking up her contact details now — you can review and edit the message before sending

```tsx agent.run
const data = new Data({
  toName: "Nona",
  toEmail: "" as string,
  state: "idle" as "idle" | "sending" | "done" | "error",
  error: "" as string,
});

const streamedData = new StreamedData("message");

const messageComponent = mount({
  data,
  streamedData,
  outputSchema: z.object({
    action: z.enum(["send", "cancel"]),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  ui: ({ data, streamedData, output }) => (
    <Card sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Send christmas greetings to Nona
      </Typography>

      <Typography variant="body2" sx={{ mb: 2 }}>
        To: <b>{data.toName}</b>{" "}
        {data.toEmail ? `(${data.toEmail})` : "(looking up contact…)"}
      </Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        <TextField
          {...output.subject}
          label="Subject"
          fullWidth
          value={output.subject.value || streamedData.subject}
          InputLabelProps={{ shrink: true }}
          disabled={data.state !== "idle"}
        />
        <TextField
          {...output.body}
          label="Message"
          fullWidth
          multiline
          rows={6}
          value={output.body.value || streamedData.body}
          InputLabelProps={{ shrink: true }}
          disabled={data.state !== "idle"}
        />
      </Stack>

      {data.state === "idle" && (
        <Stack direction="row" spacing={1}>
          <Button
            type="submit"
            variant="contained"
            onClick={() => output.action.onChange("send")}
            {...output}
          >
            Send
          </Button>
          <Button
            type="submit"
            variant="outlined"
            onClick={() => output.action.onChange("cancel")}
            {...output}
          >
            Cancel
          </Button>
        </Stack>
      )}
    </Card>
  ),
});

(async () => {
  const contacts = await searchContacts("nona");
  data.toName = contacts[0].name;
  data.toEmail = contacts[0].email;
})();
```

​```json agent.data => "message"
{
    "subject": "Merry Christmas",
    "body": "Dear Nona!\n\nMerry Christmas! Wishing you joy, health, and happiness now and always.\n\nBest wishes,\n"
}
```

```tsx agent.run
const mail = await messageComponent.result;

data.state = "sending";

(async () => {
  await sendMail({
    to: data.toEmail,
    subject: mail.subject,
    body: mail.body,
  });
  data.state = "done";
  console.log("message sent successfully.")
})();

mount({
  data,
  ui: ({ data, output }) => (
    <Alert
      severity={
        data.state === "error" ? "error" : data.state === "done" ? "success" : "info"
      }
      icon={
        data.state === "sending"
          ? <CircularProgress size={20} />
          : undefined
      }
      sx={{ mb: 2 }}
    >
      State: <b>{data.state}</b>
      {data.error ? ` — ${data.error}` : ""}
    </Alert>
  ),
});
```