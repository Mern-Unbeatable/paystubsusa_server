import React from "react";
import stubData from "../../../../data/generator/templateStubData.json";
import templates from "../../../../data/generator/templates.json";
import ScaledDocument from "./ScaledDocument";
import { themeStyle } from "../../../utils/paystubTheme";
import {
  CompanyLogo,
  DOCUMENT_PAGE,
  SAMPLE_LOGO,
  SAMPLE_PAYSTUB_DOCUMENT,
  TemplateDocument,
  hasTemplateDocument,
} from "../../../templates";

const STUB_DATA = { ...stubData, company: { ...stubData.company, logo: SAMPLE_LOGO } };
export const TEMPLATES = templates;

// Card thumbnails show the top of the page so they line up with the other cards.
const THUMBNAIL_VISIBLE_HEIGHT = 880;

const DocumentThumbnail = ({ template, full }) => (
  <div className="w-full bg-white border border-slate-200/80 rounded-md overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
    <ScaledDocument
      width={DOCUMENT_PAGE.width}
      height={DOCUMENT_PAGE.height}
      visibleHeight={full ? DOCUMENT_PAGE.height : THUMBNAIL_VISIBLE_HEIGHT}
    >
      <TemplateDocument template={template} data={SAMPLE_PAYSTUB_DOCUMENT} />
    </ScaledDocument>
  </div>
);

// Company block: optional logo on the left, a divider, then the company details.
const ThumbnailCompany = ({ logo, dark = false, children }) => (
  <div className="flex items-center gap-1.5 min-w-0">
    {logo && (
      <>
        <CompanyLogo src={logo} boxWidth={40} boxHeight={24} shrink />
        <span className={`self-stretch w-px shrink-0 ${dark ? "bg-white/40" : "bg-(--ps-b300)"}`} />
      </>
    )}
    <div className="min-w-0">{children}</div>
  </div>
);

// Miniature rendered Paystub Document matching Figma
export const PaystubThumbnail = ({ template, full = false, data = STUB_DATA, framed = true }) => {
  if (hasTemplateDocument(template)) return <DocumentThumbnail template={template} full={full} />;

  const stub = data;
  const { headerVariant, netPayVariant, tableVariant, theme } = template;

  return (
    <div
      style={themeStyle(theme, framed)}
      className={`w-full bg-(--ps-bg) text-[calc(7.5px*var(--ps-fs))] leading-(--ps-lh) select-none font-sans ${
        framed ? "border border-slate-200/80 rounded-md p-2.5 sm:p-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]" : ""
      }`}
    >
      {/* 1. Top Header Banner */}
      {headerVariant === "dark-full" && (
        <div className="bg-(--ps-primary) text-white p-2 rounded-(--ps-radius) flex justify-between items-center mb-(--ps-gap)">
          <div>
            <ThumbnailCompany logo={stub.company.logo} dark>
              <p className="font-bold text-[calc(8.5px*var(--ps-fs))]">{stub.company.name}</p>
              <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.ein}
              </p>
              {stub.company.phone && <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="text-right">
            <p className="font-bold text-[calc(8px*var(--ps-fs))] uppercase tracking-wider">
              {stub.statement.title}
            </p>
            <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {headerVariant === "blue-full" && (
        <div className="bg-(--ps-accent) text-white p-2 rounded-(--ps-radius) flex justify-between items-center mb-(--ps-gap)">
          <div>
            <ThumbnailCompany logo={stub.company.logo} dark>
              <p className="font-bold text-[calc(8.5px*var(--ps-fs))]">{stub.company.name}</p>
              <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.ein}
              </p>
              {stub.company.phone && <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="text-right">
            <p className="font-bold text-[calc(8px*var(--ps-fs))] uppercase tracking-wider">
              {stub.statement.title}
            </p>
            <p className="text-white/80 text-[calc(6.5px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {headerVariant === "minimal-blue-line" && (
        <div className="border-b border-(--ps-accent) pb-1.5 mb-(--ps-gap) flex justify-between items-center">
          <div>
            <ThumbnailCompany logo={stub.company.logo}>
              <p className="font-bold text-(--ps-accent) text-[calc(8.5px*var(--ps-fs))]">
                {stub.company.name}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.ein}
              </p>
              {stub.company.phone && <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="text-right">
            <p className="font-bold text-(--ps-s800) text-[calc(8px*var(--ps-fs))]">
              {stub.statement.title}
            </p>
            <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {headerVariant === "minimal-dark-line" && (
        <div className="border-b border-slate-800 pb-1.5 mb-(--ps-gap) flex justify-between items-center">
          <div>
            <ThumbnailCompany logo={stub.company.logo}>
              <p className="font-bold text-(--ps-s900) text-[calc(8.5px*var(--ps-fs))]">
                {stub.company.name}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.ein}
              </p>
              {stub.company.phone && <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="text-right">
            <p className="font-bold text-(--ps-s800) text-[calc(8px*var(--ps-fs))]">
              {stub.statement.title}
            </p>
            <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {headerVariant === "boxed" && (
        <div className="border border-(--ps-b200) p-1.5 rounded-(--ps-radius) mb-(--ps-gap) flex justify-between items-center">
          <div>
            <ThumbnailCompany logo={stub.company.logo}>
              <p className="font-bold text-(--ps-accent) text-[calc(8px*var(--ps-fs))]">
                {stub.company.name}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
                {stub.company.ein}
              </p>
              {stub.company.phone && <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="text-right">
            <p className="font-bold text-(--ps-s800) text-[calc(7.5px*var(--ps-fs))]">
              {stub.statement.title}
            </p>
            <p className="text-(--ps-s500) text-[calc(6.5px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {headerVariant === "split-dark" && (
        <div className="flex justify-between items-stretch mb-(--ps-gap) overflow-hidden rounded-(--ps-radius)">
          <div className="bg-(--ps-primary) text-white p-1.5 w-[56%]">
            <ThumbnailCompany logo={stub.company.logo} dark>
              <p className="font-bold text-[calc(8px*var(--ps-fs))]">{stub.company.name}</p>
              <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">{stub.company.ein}</p>
              {stub.company.phone && <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="p-1.5 text-right w-[44%] flex flex-col justify-center">
            <p className="font-bold text-(--ps-s800) text-[calc(7.5px*var(--ps-fs))]">
              {stub.statement.title}
            </p>
            <p className="text-(--ps-s500) text-[calc(6px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {headerVariant === "split-blue" && (
        <div className="flex justify-between items-stretch mb-(--ps-gap) overflow-hidden rounded-(--ps-radius)">
          <div className="bg-(--ps-accent) text-white p-1.5 w-[56%]">
            <ThumbnailCompany logo={stub.company.logo} dark>
              <p className="font-bold text-[calc(8px*var(--ps-fs))]">{stub.company.name}</p>
              <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">
                {stub.company.address}
              </p>
              <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">
                {stub.company.cityStateZip}
              </p>
              <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">{stub.company.ein}</p>
              {stub.company.phone && <p className="text-white/80 text-[calc(6px*var(--ps-fs))]">{stub.company.phone}</p>}
            </ThumbnailCompany>
          </div>
          <div className="p-1.5 text-right w-[44%] flex flex-col justify-center">
            <p className="font-bold text-(--ps-s800) text-[calc(7.5px*var(--ps-fs))]">
              {stub.statement.title}
            </p>
            <p className="text-(--ps-s500) text-[calc(6px*var(--ps-fs))]">
              {stub.statement.payDate}
            </p>
          </div>
        </div>
      )}

      {/* 2. Employee Info & Net Pay Row */}
      <div className="grid grid-cols-12 gap-1.5 mb-[calc(var(--ps-gap)+2px)] items-center">
        {/* Employee */}
        <div className="col-span-4 bg-(--ps-surface) p-1.5 rounded-(--ps-radius) border border-(--ps-b100)">
          <p className="text-(--ps-s400) text-[calc(6px*var(--ps-fs))] uppercase font-semibold">
            Employee
          </p>
          <p className="font-bold text-(--ps-s800) text-[calc(7px*var(--ps-fs))] wrap-anywhere">
            {stub.employee.name}
          </p>
          <p className="text-(--ps-s500) text-[calc(6px*var(--ps-fs))] wrap-anywhere">
            {stub.employee.address}
          </p>
          <p className="text-(--ps-s500) text-[calc(6px*var(--ps-fs))] wrap-anywhere">
            {stub.employee.cityStateZip}
          </p>
        </div>

        {/* Pay Period */}
        <div className="col-span-4 bg-(--ps-surface) p-1.5 rounded-(--ps-radius) border border-(--ps-b100)">
          <p className="text-(--ps-s400) text-[calc(6px*var(--ps-fs))] uppercase font-semibold">
            Pay Period
          </p>
          <p className="font-medium text-(--ps-s800) text-[calc(6.5px*var(--ps-fs))] truncate">
            {stub.payPeriod.dates}
          </p>
          <p className="text-(--ps-s500) text-[calc(6px*var(--ps-fs))] truncate">
            {stub.payPeriod.frequency}
          </p>
          <p className="text-(--ps-s500) text-[calc(6px*var(--ps-fs))] truncate">
            {stub.payPeriod.id}
          </p>
        </div>

        {/* Net Pay Callout */}
        <div
          className={`col-span-4 p-1.5 rounded-(--ps-radius) text-center flex flex-col justify-center ${
            netPayVariant === "blue"
              ? "bg-(--ps-accent) text-white"
              : "bg-(--ps-primary) text-white"
          }`}
        >
          <p className="text-[calc(6px*var(--ps-fs))] uppercase tracking-wider text-white/80 font-medium">
            Net Pay
          </p>
          <p className="font-bold text-[calc(9.5px*var(--ps-fs))] sm:text-[calc(10.5px*var(--ps-fs))]">
            {stub.netPay}
          </p>
        </div>
      </div>

      {/* 3. Earnings & Taxes Breakdown */}
      <div className="grid grid-cols-2 gap-2 mb-(--ps-gap)">
        {/* Earnings Table */}
        <div>
          <div
            className={`px-1.5 py-0.5 rounded-t-(--ps-radius) text-[calc(6.5px*var(--ps-fs))] font-bold flex justify-between ${
              tableVariant === "solid-blue"
                ? "bg-(--ps-accent) text-white"
                : tableVariant === "solid-dark"
                  ? "bg-(--ps-primary) text-white"
                  : tableVariant === "minimal-gray"
                    ? "bg-slate-800 text-white"
                    : "bg-(--ps-tint) text-(--ps-primary)"
            }`}
          >
            <span>EARNINGS</span>
            <span>AMOUNT</span>
          </div>
          <div className="space-y-0.5 py-1 text-[calc(6.5px*var(--ps-fs))]">
            {stub.earnings.map((e, idx) => (
              <div key={idx} className="flex justify-between text-(--ps-s600)">
                <span className="truncate">
                  {e.desc}{" "}
                  {e.rate && (
                    <span className="text-(--ps-s400) text-[calc(5.5px*var(--ps-fs))]">
                      {e.rate}
                    </span>
                  )}
                </span>
                <span className="font-medium text-(--ps-s700)">{e.amount}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-(--ps-s900) border-t border-(--ps-b100) pt-0.5 mt-0.5">
              <span>Gross Pay</span>
              <span>{stub.grossPay}</span>
            </div>
          </div>
        </div>

        {/* Taxes Table */}
        <div>
          <div
            className={`px-1.5 py-0.5 rounded-t-(--ps-radius) text-[calc(6.5px*var(--ps-fs))] font-bold flex justify-between ${
              tableVariant === "solid-blue"
                ? "bg-(--ps-accent) text-white"
                : tableVariant === "solid-dark"
                  ? "bg-(--ps-primary) text-white"
                  : tableVariant === "minimal-gray"
                    ? "bg-slate-800 text-white"
                    : "bg-(--ps-tint) text-(--ps-primary)"
            }`}
          >
            <span>TAXES</span>
            <span>AMOUNT</span>
          </div>
          <div className="space-y-0.5 py-1 text-[calc(6.5px*var(--ps-fs))]">
            {stub.taxes.map((t, idx) => (
              <div key={idx} className="flex justify-between text-(--ps-s600)">
                <span className="truncate">{t.desc}</span>
                <span className="font-medium text-(--ps-s700)">{t.amount}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-(--ps-s900) border-t border-(--ps-b100) pt-0.5 mt-0.5">
              <span>Total Taxes</span>
              <span>{stub.totalTaxes}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Other Deductions & Bottom Summary */}
      <div className="border-t border-slate-150 pt-1 text-[calc(6.5px*var(--ps-fs))] flex justify-between text-(--ps-s500) font-medium">
        <span>
          Gross Pay:{" "}
          <strong className="text-(--ps-s800)">{stub.summary.gross}</strong>
        </span>
        <span>
          Deductions:{" "}
          <strong className="text-(--ps-s800)">
            {stub.summary.deductions}
          </strong>
        </span>
        <span>
          Net Pay:{" "}
          <strong className="text-(--ps-s800)">{stub.summary.net}</strong>
        </span>
      </div>
    </div>
  );
};
