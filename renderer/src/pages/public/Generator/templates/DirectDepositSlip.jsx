import React from "react";
import CompanyLogo from "./CompanyLogo";
import { shouldRenderDirectDepositSlip } from "./shouldRenderDirectDepositSlip";

export { shouldRenderDirectDepositSlip };

/** Mask like XXXXXX5254 (Xs + last 4 digits). */
const maskAccount = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return digits;
  return `${"X".repeat(Math.min(6, digits.length - 4))}${digits.slice(-4)}`;
};

const routingDigits = (value) => String(value || "").replace(/\D/g, "");

/** First 4 digits of the routing number (Transit). */
const transitFromRouting = (value) => {
  const digits = routingDigits(value);
  if (!digits) return "—";
  return digits.slice(0, 4).padEnd(Math.min(4, digits.length), "X");
};

/** Last 3 digits of the routing number (ABA check / bank id). */
const abaFromRouting = (value) => {
  const digits = routingDigits(value);
  if (!digits) return "—";
  return digits.slice(-3);
};

const SIZES = {
  // Match variant tax rows (`Federal Income Tax` ≈ 6.5px).
  compact: {
    body: 6.5,
    label: 6,
    company: 6.5,
    amount: 7,
    logoW: 28,
    logoH: 22,
    marginTop: 16,
    cutGap: 12,
    scissors: 10,
    pad: "6px 8px",
  },
  document: {
    body: 10.5,
    label: 9.5,
    company: 10.5,
    amount: 11.5,
    logoW: 48,
    logoH: 36,
    marginTop: 28,
    cutGap: 16,
    scissors: 14,
    pad: "10px 12px",
  },
};

/** Cut-line scissors for the detachable slip (inline SVG so PDF/print stay crisp). */
const CutScissors = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ display: "block", flexShrink: 0 }}
  >
    <circle cx="6" cy="6" r="2.75" stroke="#64748b" strokeWidth="1.6" />
    <circle cx="6" cy="18" r="2.75" stroke="#64748b" strokeWidth="1.6" />
    <path
      d="M8.2 7.6 20 18.5M8.2 16.4 20 5.5"
      stroke="#64748b"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Detachable direct-deposit advice printed under the paystub.
 * Layout matches classic payroll stubs: company block, deposit summary, detail columns.
 * `compact` — match variant thumbnail type; omit for full-page document templates.
 */
const DirectDepositSlip = ({ data, compact = false }) => {
  const dd = data?.directDeposit;
  if (!shouldRenderDirectDepositSlip(dd)) return null;

  const s = compact ? SIZES.compact : SIZES.document;
  const company = data.company ?? {};
  const employeeName =
    dd.accountHolderName || data.employee?.name || data.employeeName || "—";
  const payDate =
    data.period?.payDate ||
    String(data.statement?.payDate || "").replace(/^Pay Date:\s*/i, "") ||
    "—";
  const cityLine = company.cityStateZip || company.cityLine || "";
  const maskedAccount = maskAccount(dd.accountNumber);
  const amountText = dd.netPayText || "—";

  const colLabel = {
    fontWeight: 700,
    fontSize: s.label,
    color: "#0f172a",
    lineHeight: 1.25,
    marginBottom: compact ? 2 : 3,
  };
  const colValue = {
    fontWeight: 400,
    fontSize: s.body,
    color: "#0f172a",
    lineHeight: 1.3,
  };

  return (
    <div
      style={{
        marginTop: s.marginTop,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#0f172a",
        fontSize: s.body,
        lineHeight: 1.35,
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? 4 : 6,
          marginBottom: s.cutGap,
        }}
        aria-hidden="true"
      >
        <CutScissors size={s.scissors} />
        <div
          style={{
            flex: 1,
            borderTop: `${compact ? 1.5 : 2}px dashed #94a3b8`,
            minWidth: 0,
          }}
        />
      </div>

      <div
        style={{
          padding: s.pad,
          background: "transparent",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: compact ? 12 : 24,
            marginBottom: compact ? 6 : 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: compact ? 6 : 8,
              minWidth: 0,
              flex: 1,
            }}
          >
            {company.logo ? (
              <CompanyLogo
                src={company.logo}
                boxWidth={s.logoW}
                boxHeight={s.logoH}
                shrink
              />
            ) : null}
            <div
              style={{
                fontSize: s.company,
                lineHeight: 1.35,
                minWidth: 0,
              }}
            >
              {company.name ? (
                <div style={{ fontWeight: 700 }}>{company.name}</div>
              ) : null}
              {company.address ? <div>{company.address}</div> : null}
              {cityLine ? <div>{cityLine}</div> : null}
              {company.phone ? <div>{company.phone}</div> : null}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              fontSize: s.body,
              lineHeight: 1.45,
              textAlign: "left",
              whiteSpace: "nowrap",
            }}
          >
            <div>
              <span style={{ fontWeight: 700 }}>Direct Deposit:</span>{" "}
              {maskedAccount}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Pay date:</span> {payDate}
            </div>
          </div>
        </div>

        {/* Header row → rule → values (rule sits flush under headers). */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1.1fr 0.7fr 0.55fr 1fr",
            columnGap: compact ? 6 : 10,
            alignItems: "end",
            borderBottom: "1px solid #334155",
            paddingBottom: 1,
          }}
        >
          <div style={{ ...colLabel, marginBottom: 0 }}>
            Deposited to the account of
          </div>
          <div style={{ ...colLabel, marginBottom: 0 }}>Account Number</div>
          <div style={{ ...colLabel, marginBottom: 0 }}>Transit</div>
          <div style={{ ...colLabel, marginBottom: 0 }}>ABA</div>
          <div style={{ ...colLabel, marginBottom: 0 }}>Amount</div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1.1fr 0.7fr 0.55fr 1fr",
            columnGap: compact ? 6 : 10,
            alignItems: "start",
            paddingTop: compact ? 2 : 3,
          }}
        >
          <div style={colValue}>{employeeName}</div>
          <div style={colValue}>{maskedAccount}</div>
          <div style={colValue}>{transitFromRouting(dd.routingNumber)}</div>
          <div style={colValue}>{abaFromRouting(dd.routingNumber)}</div>
          <div
            style={{
              ...colValue,
              display: "inline-block",
              fontWeight: 700,
              fontSize: s.amount,
              border: "1px solid #CCCCCC",
              padding: compact ? "1px 5px" : "2px 8px",
              lineHeight: 1.3,
            }}
          >
            {amountText}
          </div>
        </div>
        <div
          style={{
            marginTop: compact ? 8 : 12,
            textAlign: "right",
            fontWeight: 700,
            fontSize: s.label,
            letterSpacing: "0.02em",
          }}
        >
          NON-NEGOTIABLE
        </div>
      </div>
    </div>
  );
};

export default DirectDepositSlip;
