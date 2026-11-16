import React from "react";

const Nec1099FormDocument = ({ formData }) => (
  <div className="p-3 text-[9px] leading-tight font-sans text-slate-900 select-none">
    {/* Header: VOID, CORRECTED */}
    <div className="flex items-center justify-center gap-6 border-b border-slate-400 pb-1 text-[8px] text-slate-600 font-medium">
      <div className="flex items-center gap-1">
        <div className="w-2.5 h-2.5 border border-slate-400" />
        <span>VOID</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2.5 h-2.5 border border-slate-400" />
        <span>CORRECTED</span>
      </div>
    </div>

    {/* Middle Grid */}
    <div className="grid grid-cols-12 border-b border-slate-400">
      {/* Left Side (Payer, Recipient details) */}
      <div className="col-span-7 border-r border-slate-400">
        {/* Payer's Details */}
        <div className="p-1 border-b border-slate-400 min-h-[50px]">
          <span className="text-[6.5px] text-slate-500 block leading-tight">
            PAYER'S name, street address, city, state, ZIP, and telephone no.
          </span>
          <p className="font-bold text-[8.5px] mt-0.5">
            {formData.payerName || "Payer Name"}
          </p>
          <p className="text-[7.5px] text-slate-700">
            {formData.streetAddress || "100 Innovation Way"}
          </p>
          <p className="text-[7.5px] text-slate-700">
            {formData.city || "Austin"}, {formData.state || "TX"}{" "}
            {formData.zipCode || "78701"}
          </p>
        </div>

        {/* TINs Row */}
        <div className="grid grid-cols-2 border-b border-slate-400 min-h-[26px]">
          <div className="p-1 border-r border-slate-400">
            <span className="text-[6.5px] text-slate-500 block">
              PAYER'S TIN
            </span>
            <span className="font-semibold text-[8px]">
              {formData.payerTin || "12-3456789"}
            </span>
          </div>
          <div className="p-1">
            <span className="text-[6.5px] text-slate-500 block">
              RECIPIENT'S TIN
            </span>
            <span className="font-semibold text-[8px]">
              {formData.recipientTin || "456-78-9012"}
            </span>
          </div>
        </div>

        {/* Recipient's Name */}
        <div className="p-1 border-b border-slate-400 min-h-[26px]">
          <span className="text-[6.5px] text-slate-500 block">
            RECIPIENT'S name
          </span>
          <p className="font-bold text-[8.5px] uppercase">
            {formData.recipientName || "Alex R. Rivera"}
          </p>
        </div>

        {/* Recipient's Street Address */}
        <div className="p-1 border-b border-slate-400 min-h-[26px]">
          <span className="text-[6.5px] text-slate-500 block">
            Street address (including apt. no.)
          </span>
          <p className="text-[7.5px]">
            {formData.recipientStreetAddress || "240 Evergreen Ter"}
          </p>
        </div>

        {/* City, State, ZIP */}
        <div className="p-1 border-b border-slate-400 min-h-[26px]">
          <span className="text-[6.5px] text-slate-500 block">
            City or town, state or province, country, and ZIP
          </span>
          <p className="text-[7.5px]">
            {formData.recipientCity || "Austin"},{" "}
            {formData.recipientState || "TX"}{" "}
            {formData.recipientZipCode || "78704"}
          </p>
        </div>

        {/* Account Number */}
        <div className="p-1 min-h-[22px]">
          <span className="text-[6.5px] text-slate-500 block">
            Account number (see instructions)
          </span>
          <p className="text-[7.5px]">
            {[formData.accountNumber, formData.recipientAccountNumber]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      {/* Right Side (Boxes 1 - 7) */}
      <div className="col-span-5">
        {/* Title & OMB */}
        <div className="p-1 border-b border-slate-400 bg-slate-100/60 min-h-[46px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[7px] text-slate-500">
            <span>OMB No. 1545-0115</span>
            <strong className="text-slate-900 text-[10px]">2022</strong>
          </div>
          <div>
            <span className="font-bold text-[9px] block">
              Nonemployee Compensation
            </span>
            <span className="text-[6.5px] text-slate-500">
              Copy 1 For State Tax Department
            </span>
          </div>
        </div>

        {/* Box 1: Nonemployee compensation */}
        <div className="p-1 border-b border-slate-400 min-h-[30px]">
          <span className="text-[6.5px] text-slate-500 block">
            1 Nonemployee compensation
          </span>
          <span className="font-bold text-[9px] block text-right">
            ${formData.box1NonemployeeComp || "0.00"}
          </span>
        </div>

        {/* Box 2: Direct Sales */}
        <div className="p-1 border-b border-slate-400 text-[6.5px] text-slate-600 min-h-[24px] flex items-center justify-between">
          <span>2 Payer made direct sales totaling $5,000 or more</span>
          <span className="font-bold">
            {formData.box2DirectSales ? "☑" : "□"}
          </span>
        </div>

        {/* Box 3: Excess Golden Parachute */}
        <div className="p-1 border-b border-slate-400 min-h-[22px]">
          <span className="text-[6.5px] text-slate-500 block">
            3 Excess golden parachute payments
          </span>
          <span className="text-[7.5px] block text-right">
            {formData.box3ExcessGoldenParachute
              ? `$${formData.box3ExcessGoldenParachute}`
              : ""}
          </span>
        </div>

        {/* Box 4: Federal Tax Withheld */}
        <div className="p-1 border-b border-slate-400 min-h-[26px]">
          <span className="text-[6.5px] text-slate-500 block">
            4 Federal income tax withheld
          </span>
          <span className="font-bold text-[8.5px] block text-right">
            ${formData.box4FederalTax || "0.00"}
          </span>
        </div>

        {/* Boxes 5 - 7: State Tax */}
        <div className="grid grid-cols-3 text-[6.5px] p-0.5">
          <div className="border-r border-slate-300 pr-0.5">
            <span className="text-slate-500 block">5 State tax</span>
            <span className="text-[7.5px] font-semibold">
              {formData.stateTaxWithheld
                ? `$${formData.stateTaxWithheld}`
                : "—"}
            </span>
          </div>
          <div className="border-r border-slate-300 px-0.5">
            <span className="text-slate-500 block">6 State/Payer's no.</span>
            <span className="text-[7.5px] block break-words">
              {[formData.stateReportingState, formData.statePayerNo]
                .filter(Boolean)
                .join(" / ") || "—"}
            </span>
          </div>
          <div className="pl-0.5">
            <span className="text-slate-500 block">7 State income</span>
            <span className="text-[7.5px] font-semibold">
              ${formData.stateIncome || "0.00"}
            </span>
          </div>
        </div>
      </div>
    </div>

    {/* Official IRS Title Footer */}
    <div className="pt-2 flex items-center justify-between font-bold text-[8px]">
      <div className="flex items-baseline gap-1">
        <span className="text-[10px] font-black text-slate-900">
          Form 1099-NEC
        </span>
        <span className="text-[7px] text-slate-500 font-normal">
          (Rev. 1-2022)
        </span>
      </div>
      <span className="text-[6.5px] text-slate-500 font-normal">
        Department of the Treasury—Internal Revenue Service
      </span>
    </div>
  </div>
);

export default Nec1099FormDocument;
