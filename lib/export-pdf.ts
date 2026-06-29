import { jsPDF } from "jspdf";

export type PdfReportData = {
  monthLabel: string;
  income: number;
  spent: number;
  remaining: number;
  expenseCount: number;
  incomeSources: { name: string; amount: number }[];
  topExpenses: { desc: string; amount: number; cat: string; date: string }[];
  goals: { name: string; current: number; target: number }[];
  fmt: (n: number) => string;
};

export function downloadMonthPdf(filename: string, data: PdfReportData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;

  const line = (text: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(text, 14, y);
    y += size * 0.45 + 4;
  };

  line("LifeOS — Monthly Report", 18, true);
  line(data.monthLabel, 13);
  y += 4;

  line(`Total Income: ${data.fmt(data.income)}`, 11, true);
  line(`Total Spent: ${data.fmt(data.spent)}`);
  line(`Remaining: ${data.fmt(data.remaining)}`);
  line(`Expenses logged: ${data.expenseCount}`);
  y += 4;

  line("Income Sources", 12, true);
  data.incomeSources.slice(0, 8).forEach((i) => line(`  ${i.name}: ${data.fmt(i.amount)}`, 10));
  y += 2;

  line("Recent Expenses", 12, true);
  data.topExpenses.slice(0, 12).forEach((e) =>
    line(`  ${e.date} | ${e.cat} | ${e.desc.slice(0, 28)} | ${data.fmt(e.amount)}`, 9)
  );
  y += 2;

  if (data.goals.length) {
    line("Savings Goals", 12, true);
    data.goals.slice(0, 6).forEach((g) =>
      line(`  ${g.name}: ${data.fmt(g.current)} / ${data.fmt(g.target)}`, 10)
    );
  }

  line("", 8);
  line(`Generated ${new Date().toLocaleString()} — LifeOS`, 8);

  doc.save(filename);
}
