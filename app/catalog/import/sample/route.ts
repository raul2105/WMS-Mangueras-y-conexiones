import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-static";

export async function GET() {
  const filePath = path.join(process.cwd(), "data", "products.sample.csv");
  const contents = await fs.readFile(filePath);
  return new Response(contents, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="products.sample.csv"',
    },
  });
}
