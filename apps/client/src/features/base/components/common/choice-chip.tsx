import { PropertyChoice } from "@/features/base/types/base.types";
import { choiceColorStyle } from "@/features/base/utils/choice-colors";
import classes from "../cells/cells.module.css";

type Props = {
  choice: Pick<PropertyChoice, "name" | "color">;
  // the property turned colours off
  plain?: boolean;
};

export function ChoiceChip({ choice, plain }: Props) {
  return (
    <span
      className={`${classes.badge} ${plain ? classes.plainBadge : ""}`}
      style={plain ? undefined : choiceColorStyle(choice.color)}
      title={choice.name}
    >
      {choice.name || "\u00a0"}
    </span>
  );
}
