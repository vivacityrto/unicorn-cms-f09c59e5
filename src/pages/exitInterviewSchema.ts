export type ExitInterviewQuestion =
  | { key: string; label: string; type: "textarea" }
  | { key: string; label: string; type: "rating" };

export type ExitInterviewSection = {
  key: string;
  title: string;
  description?: string;
  questions: ExitInterviewQuestion[];
};

export const RATING_LABELS = [
  "Strongly Disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly Agree",
];

export const EXIT_INTERVIEW_SECTIONS: ExitInterviewSection[] = [
  {
    key: "s1",
    title: "Section 1 — Role & Responsibilities",
    questions: [
      { key: "s1_q1", type: "textarea", label: "How well did your role match the position description you were given when you joined?" },
      { key: "s1_q2", type: "textarea", label: "Did your responsibilities change significantly during your tenure? If so, how were those changes communicated and managed?" },
      { key: "s1_q3", type: "textarea", label: "Were you given the tools, systems, and access you needed to perform your role effectively?" },
      { key: "s1_q4", type: "textarea", label: "Were workloads distributed fairly across the team? Did you feel your capacity was respected?" },
    ],
  },
  {
    key: "s2",
    title: "Section 2 — Leadership & Culture",
    questions: [
      { key: "s2_q1", type: "textarea", label: "How would you describe the overall culture at Vivacity during your time here?" },
      { key: "s2_q2", type: "textarea", label: "Did you feel supported by leadership? Were expectations communicated clearly?" },
      { key: "s2_q3", type: "textarea", label: "Did you feel comfortable raising concerns, feedback, or ideas with your manager or the leadership team?" },
      { key: "s2_q4", type: "textarea", label: "Were there any behaviours, dynamics, or patterns within the team that you felt impacted your experience negatively?" },
    ],
  },
  {
    key: "s3",
    title: "Section 3 — Performance & Development",
    questions: [
      { key: "s3_q1", type: "textarea", label: "Did you receive regular, meaningful feedback on your performance? Was the KPI framework clear and fair?" },
      { key: "s3_q2", type: "textarea", label: "Were there opportunities for professional development, upskilling, or career progression?" },
      { key: "s3_q3", type: "textarea", label: "Did you feel recognised for strong performance? Were there barriers to your success that should be addressed?" },
      { key: "s3_q4", type: "textarea", label: "How did you find working within the Standards for RTOs 2025 framework? Was sufficient training provided?" },
    ],
  },
  {
    key: "s4",
    title: "Section 4 — Systems & Processes",
    questions: [
      { key: "s4_q1", type: "textarea", label: "How effective were the internal systems you used day-to-day (Unicorn CMS, ComplyHub.ai, Microsoft Teams, Notion)?" },
      { key: "s4_q2", type: "textarea", label: "Were SOPs, workflows, and operational processes clear and accessible? Were they followed consistently?" },
      { key: "s4_q3", type: "textarea", label: "Were there recurring friction points or inefficiencies that slowed your work? What would you improve?" },
      { key: "s4_q4", type: "textarea", label: "Did the ticketing and client support processes work well? What would have made them better?" },
    ],
  },
  {
    key: "s5",
    title: "Section 5 — Client & Stakeholder Engagement",
    questions: [
      { key: "s5_q1", type: "textarea", label: "How would you describe the quality of client relationships managed during your tenure?" },
      { key: "s5_q2", type: "textarea", label: "Did you have the support and frameworks needed to deliver a high-quality client experience?" },
      { key: "s5_q3", type: "textarea", label: "Were handovers, escalations, and cross-team coordination handled effectively?" },
    ],
  },
  {
    key: "s6",
    title: "Section 6 — Primary Reason for Leaving",
    questions: [
      { key: "s6_q1", type: "textarea", label: "What was the primary reason for your decision to leave?" },
      { key: "s6_q2", type: "textarea", label: "Were there factors that, if changed, would have led you to stay?" },
      { key: "s6_q3", type: "textarea", label: "Was there a specific event or turning point that influenced your decision?" },
      { key: "s6_q4", type: "textarea", label: "Did you discuss your concerns with anyone internally before deciding to leave? What was the outcome?" },
    ],
  },
  {
    key: "s7",
    title: "Section 7 — Satisfaction Ratings",
    description: "Rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree).",
    questions: [
      { key: "s7_q1", type: "rating", label: "I understood what was expected of me in my role." },
      { key: "s7_q2", type: "rating", label: "My workload was manageable and sustainable." },
      { key: "s7_q3", type: "rating", label: "I received adequate support from my manager." },
      { key: "s7_q4", type: "rating", label: "I was recognised and appreciated for my contributions." },
      { key: "s7_q5", type: "rating", label: "I had access to the tools and systems I needed." },
      { key: "s7_q6", type: "rating", label: "The team culture was positive and respectful." },
      { key: "s7_q7", type: "rating", label: "Vivacity's values and standards were clear and consistently upheld." },
      { key: "s7_q8", type: "rating", label: "I would recommend Vivacity as a place to work to a colleague." },
      { key: "s7_q9", type: "rating", label: "My compensation and conditions were fair relative to my responsibilities." },
      { key: "s7_q10", type: "rating", label: "I had meaningful opportunities to grow professionally." },
    ],
  },
  {
    key: "s8",
    title: "Section 8 — Final Comments",
    questions: [
      { key: "s8_q1", type: "textarea", label: "Is there anything else you would like to share about your time at Vivacity that has not been covered above?" },
      { key: "s8_q2", type: "textarea", label: "What is one thing Vivacity does exceptionally well that it should continue?" },
      { key: "s8_q3", type: "textarea", label: "What is one thing Vivacity should change or stop doing?" },
      { key: "s8_q4", type: "textarea", label: "Do you have any suggestions for the person who will take on your responsibilities?" },
      { key: "s8_comments", type: "textarea", label: "Additional Comments (optional)" },
    ],
  },
];
