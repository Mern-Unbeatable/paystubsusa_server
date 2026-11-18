import EarningsStatementTemplate from "./EarningsStatementTemplate";
import CheckStatementTemplate from "./CheckStatementTemplate";
import DirectDepositSlip from "./DirectDepositSlip";

/** Full-page document for templates that define a `document` key in templates.json. */
const TemplateDocument = ({ template, data }) => {
  let body = null;
  switch (template?.document) {
    case "earnings-statement":
      body = <EarningsStatementTemplate data={data} />;
      break;
    case "check-statement":
      body = <CheckStatementTemplate data={data} />;
      break;
    default:
      body = null;
  }

  // 09 embeds DD (or voided check) in-body; 10 has its own check face — never append a second stub.
  const skipAppendedDd =
    template?.document === "earnings-statement" ||
    template?.document === "check-statement";

  return (
    <div>
      {body}
      {!skipAppendedDd && <DirectDepositSlip data={data} />}
    </div>
  );
};

export default TemplateDocument;
