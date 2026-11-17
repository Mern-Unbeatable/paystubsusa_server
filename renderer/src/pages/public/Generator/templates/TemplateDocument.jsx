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

  // Template 09 already has a voided advice check — do not append a second deposit stub.
  const hasBuiltInAdvice = template?.document === "earnings-statement";

  return (
    <div>
      {body}
      {!hasBuiltInAdvice && <DirectDepositSlip data={data} />}
    </div>
  );
};

export default TemplateDocument;
