import React from "react";

const Loader = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
};

export default Loader;