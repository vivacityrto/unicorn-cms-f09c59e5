import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  inviteUrl: string;
  userType: 'vivacity' | 'client';
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, inviteUrl, userType }: InvitationRequest = await req.json();

    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      throw new Error("SendGrid configuration is missing");
    }

    const subject = userType === 'vivacity' 
      ? "Invitation to Join Unicorn 2.0 - Vivacity Team"
      : "Invitation to Join Unicorn 2.0";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, rgb(97 9 161) 0%, rgb(213 28 73) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 14px 28px; background: #23C0DD; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .badge { display: inline-block; padding: 6px 12px; background: ${userType === 'vivacity' ? '#7130A0' : '#00B0F0'}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✨ Welcome to Unicorn 2.0</h1>
              <p style="margin: 10px 0 0 0;">RTO + CRICOS Compliance Management System</p>
            </div>
            <div class="content">
              <p><span class="badge">${userType === 'vivacity' ? 'VIVACITY TEAM' : 'CLIENT INVITATION'}</span></p>
              
              <h2>You've Been Invited!</h2>
              <p>You've been invited to join Unicorn 2.0 as a <strong>${userType === 'vivacity' ? 'Vivacity' : 'Client'}</strong> user.</p>
              
              <p>Click the button below to accept the invitation and complete your signup:</p>
              
              <div style="text-align: center;">
                <a href="${inviteUrl}" class="button">Accept Invitation</a>
              </div>
              
              <p style="margin-top: 30px; font-size: 14px; color: #666;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #23C0DD; word-break: break-all;">${inviteUrl}</span>
              </p>
              
              <p style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0; padding-top: 20px;">
                This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </div>
            <div class="footer">
              <p><strong>Powered by ✒️ Vivacity</strong></p>
              <p>RTO + CRICOS SUPERHERO</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const sendgridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
            subject,
          },
        ],
        from: {
          email: SENDGRID_FROM_EMAIL,
          name: "Unicorn 2.0",
        },
        content: [
          {
            type: "text/html",
            value: html,
          },
        ],
      }),
    });

    if (!sendgridResponse.ok) {
      const error = await sendgridResponse.text();
      console.error("SendGrid error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    console.log("Invitation email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
