import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./renderer.css";
import PaystubPrintDocument from "../pages/public/Generator/components/common/print/PaystubPrintDocument";
import { calculatePaystub } from "../pages/public/Generator/hooks/usePaystubFormData";
import { toGeneratorTemplate } from "../pages/public/Generator/utils/generatorTemplate";
import W2FormDocument from "../pages/public/W2/templates/W2FormDocument";
import Nec1099FormDocument from "../pages/public/1099/templates/Nec1099FormDocument";
import DirectDepositSlipDocument from "../pages/public/DirectDeposit/templates/DirectDepositSlipDocument";

const container = document.getElementById("root");
const root = createRoot(container);

const PAGE_WIDTH = 816;
const PRINT_MARGIN = 32;
const FORM_WIDTH = 480;

/** Letter-page wrapper matching PrintableDocument for tax/deposit forms. */
const FormPage = ({ children }) => (
  <div style={{ padding: PRINT_MARGIN }}>
    <div
      className="bg-white border border-slate-300"
      style={{
        width: FORM_WIDTH,
        zoom: (PAGE_WIDTH - PRINT_MARGIN * 2) / FORM_WIDTH,
      }}
    >
      {children}
    </div>
  </div>
);

const waitForImages = () =>
  Promise.all(
    [...container.querySelectorAll("img")].map((img) =>
      img.complete
        ? null
        : new Promise((resolve) => {
            img.addEventListener("load", resolve);
            img.addEventListener("error", resolve);
          }),
    ),
  );

function renderForType(type, template, formData) {
  switch (type) {
    case "paystub":
      return (
        <PaystubPrintDocument
          template={toGeneratorTemplate(template)}
          formData={formData}
          calculations={calculatePaystub(formData)}
        />
      );
    case "w2":
      return (
        <FormPage>
          <W2FormDocument formData={formData} />
        </FormPage>
      );
    case "nec1099":
      return (
        <FormPage>
          <Nec1099FormDocument formData={formData} />
        </FormPage>
      );
    case "direct_deposit":
      return (
        <FormPage>
          <DirectDepositSlipDocument formData={formData} />
        </FormPage>
      );
    default:
      throw new Error(`Unsupported document type: ${type}`);
  }
}

/**
 * Entry point for the server's PDF renderer (server/src/integrations/renderer.ts):
 * draws the document on the page, then marks the root `data-ready` once fonts and images have loaded.
 */
window.renderDocument = async ({ type, template, formData }) => {
  delete container.dataset.ready;
  flushSync(() => {
    root.render(renderForType(type, template, formData));
  });
  await document.fonts.ready;
  await waitForImages();
  container.dataset.ready = "true";
};
