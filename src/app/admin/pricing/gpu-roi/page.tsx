import { Metadata } from "next";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AdminBackButton } from "@/components/admin/AdminBackButton";

export const metadata: Metadata = {
  title: "GPU ROI",
  description: "Return on investment modeling for GPU rigs sourced from internal research.",
};

type CsvTable = {
  headers: string[];
  rows: string[][];
};

const SCIENTIFIC_NOTATION_REGEX = /^[-+]?\d+(?:\.\d+)?e[-+]?\d+$/i;

function normalizeNumericCell(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!SCIENTIFIC_NOTATION_REGEX.test(compact)) {
    return value;
  }

  const [coefficientPart, exponentPart] = compact.toLowerCase().split("e");
  const exponent = Number(exponentPart);
  if (!Number.isFinite(exponent)) {
    return value;
  }

  const sign = coefficientPart.startsWith("-") ? "-" : "";
  const unsignedCoefficient = coefficientPart.replace(/^[-+]/, "");
  const [integerPart, fractionalPart = ""] = unsignedCoefficient.split(".");
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "");
  if (digits.length === 0) {
    return "0";
  }

  const initialDecimalIndex = integerPart.length;
  const decimalIndex = initialDecimalIndex + exponent;

  let result: string;
  if (decimalIndex <= 0) {
    const zeros = "0".repeat(Math.abs(decimalIndex));
    result = `${sign}0.${zeros}${digits}`;
  } else if (decimalIndex >= digits.length) {
    const zeros = "0".repeat(decimalIndex - digits.length);
    result = `${sign}${digits}${zeros}`;
  } else {
    const left = digits.slice(0, decimalIndex);
    const right = digits.slice(decimalIndex);
    result = `${sign}${left}.${right}`;
  }

  return trimTrailingZeros(result);
}

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) {
    return normalizeSignedZero(value);
  }

  const [whole, fraction] = value.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  if (trimmedFraction.length === 0) {
    return normalizeSignedZero(whole);
  }
  return `${normalizeSignedZero(whole)}.${trimmedFraction}`;
}

function normalizeSignedZero(value: string): string {
  if (value === "-0" || value === "+0") {
    return "0";
  }
  return value;
}

async function loadGpuRoiTable(): Promise<CsvTable> {
  const filePath = path.join(process.cwd(), "src", "data", "gpu_roi_minsk.csv");
  const fileContent = await fs.readFile(filePath, "utf8");
  const table = parseCsv(fileContent);
  return formatPriceColumn(table);
}

function parseCsv(content: string): CsvTable {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let insideQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === "\"") {
      const nextChar = content[i + 1];
      if (insideQuotes && nextChar === "\"") {
        current += "\"";
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && content[i + 1] === "\n") {
        i += 1;
      }
      if (current.length > 0 || row.length > 0) {
        row.push(current);
        rows.push(row);
      }
      current = "";
      row = [];
      continue;
    }

    current += char;
  }

  if (insideQuotes) {
    throw new Error("Unterminated quoted value encountered while parsing CSV.");
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const normalizedRows = rows
    .map((cells) => cells.map((cell) => normalizeNumericCell(cell.trim())))
    .filter((cells) => cells.some((cell) => cell.length > 0));

  const [headerRow = [], ...dataRows] = normalizedRows;
  return {
    headers: headerRow,
    rows: dataRows,
  };
}

function formatPriceColumn(table: CsvTable): CsvTable {
  const priceColumnIndex = table.headers.findIndex((header) => header.trim().toLowerCase() === "price");
  if (priceColumnIndex === -1) {
    return table;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const rows = table.rows.map((row) => {
    const rawValue = row[priceColumnIndex];
    const parsedValue = Number(rawValue.replace(/[^0-9.+-]/g, ""));
    if (!Number.isFinite(parsedValue)) {
      return row;
    }

    const formattedRow = [...row];
    formattedRow[priceColumnIndex] = formatter.format(parsedValue);
    return formattedRow;
  });

  return {
    headers: [...table.headers.slice(0, priceColumnIndex), "Price", ...table.headers.slice(priceColumnIndex + 1)],
    rows,
  };
}

function getHeaderMetadata(header: string) {
  const normalized = header.trim().toLowerCase();

  if (normalized === "render time") {
    return {
      label: "Render time",
      tooltip: "Seconds required to generate a 1024×1024 image at roughly 50 diffusion steps.",
    } as const;
  }

  return {
    label: header,
    tooltip: undefined,
  } as const;
}

export default async function AdminGpuRoiPage() {
  const table = await loadGpuRoiTable();

  return (
    <div className="space-y-6">
      <AdminBackButton className="w-fit" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">GPU ROI table</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GPU ROI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className="w-full max-h-[70vh]">
            <div className="min-w-max">
              <TooltipProvider delayDuration={150}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {table.headers.map((header, headerIndex) => {
                        const metadata = getHeaderMetadata(header);
                        return (
                          <TableHead key={`heading-${headerIndex}`}>
                            {metadata.tooltip ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{metadata.label}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {metadata.tooltip}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              metadata.label
                            )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.rows.map((rowCells, rowIndex) => {
                      const rowKey = rowCells[0] || `row-${rowIndex}`;
                      return (
                        <TableRow key={rowKey}>
                          {rowCells.map((cell, cellIndex) => (
                            <TableCell key={`${rowKey}-${cellIndex}`}>{cell}</TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          </ScrollArea>
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">What the dataset contains</h2>
              <p>
                Electricity is priced at $0.075/kWh for Minsk residential tariffs. If you are on a commercial plan,
                use $0.10/kWh as the reference rate—adjusting the electricity column will linearly scale the payback
                windows.
              </p>
              <p>
                Inference latency is normalized to “~50 steps, 1024×1024” quality. Stable Diffusion XL throughput is
                treated as a proxy for Qwen-Image-Edit. An NVIDIA A100 80GB PCIe delivers roughly 8–10 s per image,
                while an RTX 4090 renders about 35% faster, so the baseline is set to 7.0 s/image for the 4090 and all
                other GPUs inherit coefficients from that baseline.
              </p>
              <p>
                Relative throughput multipliers baked into the CSV: RTX 5090 ≈ 1.40× faster than 4090, NVIDIA L40S ≈
                0.71× of 4090, RTX 6000 Ada ≈ 0.95×, A100 80GB PCIe ≈ 0.74×, and H100 80GB PCIe ≈ 2.0×. These
                assumptions are already reflected in the “Est. sec/image” and downstream productivity columns.
              </p>
              <p>
                Power draw combines the manufacturer’s “Max power” or “Total board power” plus a 75 W system overhead.
                Example inputs: L40S 350 W, RTX 6000 Ada 300 W, A100 80GB PCIe 300 W, H100 80GB PCIe 350 W, RTX 5000
                Ada 250 W, RTX 4500 Ada 210 W, RTX 4090 450 W, RTX 3090 350 W.
              </p>
              <p>
                Hardware pricing (USD) mirrors retail and marketplace quotes as of September 2025: H100 80GB PCIe
                $25k–$30k, A100 80GB PCIe $15k–$17k, L40S 48GB ≈ $8,053, RTX 6000 Ada 48GB ≈ $6,949, RTX 5000 Ada 32GB ≈
                $4,000, RTX 4500 Ada 24GB ≈ $2,326, RTX A6000 48GB ≈ $3.8k–$5k (primarily refurbished), RTX 5090 32GB
                MSRP $1,999, RTX 4090 24GB MSRP $1,599, RTX 3090 Ti 24GB ≈ $800 pre-owned, RTX 3090 24GB ≈ $750
                pre-owned.
              </p>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">How to read the table</h2>
              <ul className="list-disc space-y-1 pl-6">
                <li>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Electricity per image</span> is the
                  variable cost per render under the residential tariff assumption.
                </li>
                <li>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Savings vs $0.04/image</span>
                  compares each GPU to your current outsourced rate of $0.04, showing how much you keep per image when
                  running the workload in-house.
                </li>
                <li>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Payback days</span> assumes 24/7
                  utilization; the 50% and 25% columns show slower ramp scenarios so you can see the sensitivity to
                  real-world queue depth.
                </li>
                <li>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Post-payback variable cost</span>
                  leaves only electricity costs once you recoup the hardware spend.
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Key payback takeaways</h2>
              <ul className="list-disc space-y-1 pl-6">
                <li>
                  High-throughput 24–48 GB cards (RTX 4090, RTX 5090, and even used RTX 3090-class GPUs) achieve the
                  quickest amortization when you sustain near-continuous work.
                </li>
                <li>
                  Flagship data center cards such as H100 still generate the most images per day but need more runway to
                  recover their much higher upfront purchase price.
                </li>
                <li>
                  Once capital is recovered, electricity-driven variable costs are fractions of a cent per image, so the
                  real constraint becomes utilization and job availability.
                </li>
                <li>
                  Slower-yet-cheaper GPUs rarely beat the faster options on cost per image because diffusion workloads
                  scale almost linearly with render time—you pay for every extra second in electricity.
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Important caveats</h2>
              <p>
                These figures model an SDXL-class workload where Qwen-Image-Edit behaves similarly. Changes in sampler,
                step count, resolution, CPU offload, or storage bandwidth can shift the absolute numbers, but the GPU
                ranking should stay directionally consistent.
              </p>
              <p>
                Moving to a $0.10/kWh tariff or lower utilization stretches the payback periods proportionally—consult
                the sensitivity columns to plan for those scenarios.
              </p>
              <p>
                Need a bespoke scenario? Provide your exact resolution, step count, electricity rate, or target
                utilization and we can recompute payback ranks and cost per image for your pipeline.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
