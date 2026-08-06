export interface CommunicationBible {
  language: "es";
  maxSentences: number;
  principles: readonly string[];
  format(response: string): string;
}

function toSentences(value: string) {
  return value.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

export const ORBIT_COMMUNICATION_BIBLE: CommunicationBible = {
  language: "es",
  maxSentences: 2,
  principles: ["Profesional", "Cercano", "Natural", "Breve", "Una recomendación", "Un siguiente paso"],
  format(response) {
    return toSentences(response).slice(0, this.maxSentences).join(" ");
  },
};
