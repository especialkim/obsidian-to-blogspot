.callout {
  --callout-color: var(--callout-default);
  --callout-icon: lucide-pencil;
}
.callout[data-callout="abstract"],
.callout[data-callout="summary"],
.callout[data-callout="tldr"] {
  --callout-color: var(--callout-summary);
  --callout-icon: lucide-clipboard-list;
}
.callout[data-callout="info"] {
  --callout-color: var(--callout-info);
  --callout-icon: lucide-info;
}
.callout[data-callout="todo"] {
  --callout-color: var(--callout-todo);
  --callout-icon: lucide-check-circle-2;
}
.callout[data-callout="important"] {
  --callout-color: var(--callout-important);
  --callout-icon: lucide-flame;
}
.callout[data-callout="tip"],
.callout[data-callout="hint"] {
  --callout-color: var(--callout-tip);
  --callout-icon: lucide-flame;
}
.callout[data-callout="success"],
.callout[data-callout="check"],
.callout[data-callout="done"] {
  --callout-color: var(--callout-success);
  --callout-icon: lucide-check;
}
.callout[data-callout="question"],
.callout[data-callout="help"],
.callout[data-callout="faq"] {
  --callout-color: var(--callout-question);
  --callout-icon: help-circle;
}
.callout[data-callout="warning"],
.callout[data-callout="caution"],
.callout[data-callout="attention"] {
  --callout-color: var(--callout-warning);
  --callout-icon: lucide-alert-triangle;
}
.callout[data-callout="failure"],
.callout[data-callout="fail"],
.callout[data-callout="missing"] {
  --callout-color: var(--callout-fail);
  --callout-icon: lucide-x;
}
.callout[data-callout="danger"],
.callout[data-callout="error"] {
  --callout-color: var(--callout-error);
  --callout-icon: lucide-zap;
}
.callout[data-callout="bug"] {
  --callout-color: var(--callout-bug);
  --callout-icon: lucide-bug;
}
.callout[data-callout="example"] {
  --callout-color: var(--callout-example);
  --callout-icon: lucide-list;
}
.callout[data-callout="quote"],
.callout[data-callout="cite"] {
  --callout-color: var(--callout-quote);
  --callout-icon: quote-glyph;
}