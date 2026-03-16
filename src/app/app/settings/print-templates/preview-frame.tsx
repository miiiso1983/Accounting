"use client";

import { buildPrintTemplatePreviewDocument, type PrintTemplateTypeValue } from "@/lib/settings/print-templates";

type Props = {
  name: string;
  type: PrintTemplateTypeValue;
  headerHtml: string;
  footerHtml: string;
  logoUrl?: string;
};

export function PrintTemplatePreviewFrame({ name, type, headerHtml, footerHtml, logoUrl }: Props) {
  return (
    <iframe
      title="Print template preview"
      className="h-[560px] w-full rounded-2xl border bg-white"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={buildPrintTemplatePreviewDocument({ name, type, headerHtml, footerHtml, logoUrl })}
    />
  );
}