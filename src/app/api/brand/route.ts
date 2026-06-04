import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BRAND_DIR = path.join(process.cwd(), "public", "brand");
const BRANDS_JSON = path.join(BRAND_DIR, "brands.json");

type Brand = { id: string; name: string };

async function readBrands(): Promise<Brand[]> {
  try {
    return JSON.parse(await readFile(BRANDS_JSON, "utf8")) as Brand[];
  } catch {
    return [];
  }
}

export async function GET() {
  return Response.json(await readBrands());
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = (formData.get("name") as string | null)?.trim();
  const logo = formData.get("logo") as File | null;
  const tagline = formData.get("tagline") as File | null;

  if (!name || !logo || !tagline) {
    return Response.json({ message: "name, logo et tagline sont requis." }, { status: 400 });
  }

  const id = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const brandDir = path.join(BRAND_DIR, id);
  await mkdir(brandDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(brandDir, "logo.png"), Buffer.from(await logo.arrayBuffer())),
    writeFile(path.join(brandDir, "tagline.png"), Buffer.from(await tagline.arrayBuffer())),
  ]);

  const brands = await readBrands();
  if (!brands.find((b) => b.id === id)) {
    brands.push({ id, name });
    await writeFile(BRANDS_JSON, JSON.stringify(brands, null, 2));
  }

  return Response.json({ id, name });
}
