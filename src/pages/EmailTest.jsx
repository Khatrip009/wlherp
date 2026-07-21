import { useState } from "react";
import { sendEmail } from "../services/emailService";
import toast from "react-hot-toast";

export default function EmailTest() {
  const [sending, setSending] = useState(false);

  const handleSendTest = async () => {
    setSending(true);
    try {
      await sendEmail({
        to: "khatrip.009@gmail.com",                 // 👈 change to your own email
        subject: "Test email from ShreeVidhya ERP",
        html: "<h1>Hello!</h1><p>This is a test email sent from the ERP system via Resend.</p>",
        from: "ShreeVidhya Academy <noreply@wlh.co.in>", // must match your verified domain
      });
      toast.success("Test email sent! Check your inbox.");
    } catch (err) {
      toast.error("Failed to send email: " + err.message);
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Email Test</h1>
      <button
        onClick={handleSendTest}
        disabled={sending}
        className="bg-primary text-white px-6 py-3 rounded-lg disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send Test Email"}
      </button>
    </div>
  );
}