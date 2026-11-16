import React, { useMemo } from "react";
import { PaystubThumbnail } from "../preview/PaystubThumbnail";
import {
  DOCUMENT_PAGE,
  VARIANT_TEMPLATE_WIDTH,
  TemplateDocument,
  buildPaystubDocument,
  buildThumbnailData,
  hasTemplateDocument,
} from "../../../templates";

const PRINT_MARGIN = 32;

/** The paystub laid out on a Letter page; shared by browser print and the server PDF renderer. */
const PaystubPrintDocument = ({ template, formData, calculations }) => {
  const hasDocument = hasTemplateDocument(template);
  const data = useMemo(
    () =>
      hasDocument
        ? buildPaystubDocument(formData, calculations)
        : buildThumbnailData(formData, calculations),
    [hasDocument, formData, calculations],
  );

  return hasDocument ? (
    <TemplateDocument template={template} data={data} />
  ) : (
    <div style={{ padding: PRINT_MARGIN }}>
      <div
        style={{
          width: VARIANT_TEMPLATE_WIDTH,
          zoom: (DOCUMENT_PAGE.width - PRINT_MARGIN * 2) / VARIANT_TEMPLATE_WIDTH,
        }}
      >
        <PaystubThumbnail template={template} data={data} framed={false} />
      </div>
    </div>
  );
};

export default PaystubPrintDocument;
