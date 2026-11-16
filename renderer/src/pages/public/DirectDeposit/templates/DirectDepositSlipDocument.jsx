import React from "react";

const formatCityLine = (city, state, zip) =>
  [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") ||
  "—";

const SectionTitle = ({ children }) => (
  <div className="bg-sky-50/70 border-y border-slate-200 px-3 py-1 text-[6.5px] uppercase tracking-wider font-bold text-[#092258]">
    {children}
  </div>
);

const Field = ({ label, value, className = "", valueClassName = "" }) => (
  <div className={className}>
    <span className="text-[6px] uppercase tracking-wider text-slate-400 font-semibold block">
      {label}
    </span>
    <span
      className={`text-[7.5px] text-slate-800 font-medium block mt-0.5 break-words ${valueClassName}`}
    >
      {value || "—"}
    </span>
  </div>
);

const DirectDepositSlipDocument = ({ formData }) => (
  <div className="text-[9px] leading-tight font-sans text-slate-900 select-none">
    <div className="bg-[#092258] text-white px-3 py-2 flex items-center justify-between">
      <span className="text-[7.5px] uppercase tracking-wider font-semibold opacity-90">
        PAYMENT ADVICE
      </span>
      <span className="text-[8.5px] uppercase font-bold tracking-wider">
        DIRECT DEPOSIT
      </span>
    </div>

    <div className="p-3 flex items-start justify-between">
      <div>
        <p className="font-bold text-[11px] text-slate-900">
          {formData.employerName || "Company Name"}
        </p>
        <span className="text-[6.5px] text-slate-400 block mt-0.5">
          Reference: {formData.paymentReference || "—"}
        </span>
      </div>
      <div className="text-right border-l border-slate-200 pl-4">
        <span className="text-[6.5px] uppercase tracking-wider text-slate-400 font-semibold block">
          DEPOSIT AMOUNT
        </span>
        <p className="font-bold text-[14px] text-secondary mt-0.5">
          ${formData.depositAmount || "0.00"}
        </p>
        <span className="text-[6.5px] text-slate-400 block mt-0.5">
          Deposit date: {formData.depositDate || "—"}
        </span>
      </div>
    </div>

    <SectionTitle>Employer / Payer Details</SectionTitle>
    <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2">
      <Field label="Employer Name" value={formData.employerName} />
      <Field label="Contact" value={formData.employerContact} />
      <Field label="Address" value={formData.streetAddress} />
      <Field
        label="City / State / ZIP"
        value={formatCityLine(formData.city, formData.state, formData.zipCode)}
      />
    </div>

    <SectionTitle>Employee / Recipient Details</SectionTitle>
    <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2">
      <Field label="Employee Name" value={formData.employeeName} />
      <Field label="Employee ID" value={formData.employeeId} />
      <Field label="Address" value={formData.employeeAddress} />
      <Field
        label="City / State / ZIP"
        value={formatCityLine(
          formData.employeeCity,
          formData.employeeState,
          formData.employeeZipCode,
        )}
      />
    </div>

    <SectionTitle>Deposit Details</SectionTitle>
    <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2">
      <Field label="Deposit Date" value={formData.depositDate} />
      <Field label="Pay Period" value={formData.payPeriod} />
      <Field label="Payment Reference" value={formData.paymentReference} />
      <Field label="Bank Name" value={formData.bankName} />
      <Field label="Account Holder" value={formData.accountHolderName} />
      <Field label="Account Type" value={formData.accountType} />
      <Field
        label="Account Number"
        value={formData.accountNumber}
        valueClassName="font-mono text-slate-600"
      />
      <Field
        label="Deposit Amount"
        value={`$${formData.depositAmount || "0.00"}`}
      />
      <Field
        label="Payment Description"
        value={formData.paymentDescription}
        className="col-span-2"
      />
    </div>

    <div className="px-3 py-2.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between">
      <span className="font-semibold text-slate-700 text-[8px]">
        Payment total
      </span>
      <span className="font-bold text-secondary text-[10px]">
        ${formData.depositAmount || "0.00"}
      </span>
    </div>
  </div>
);

export default DirectDepositSlipDocument;
