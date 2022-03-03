import * as React from "react"
import { useMemo } from "react/hooks"
import { LinkedData } from "@lyonbot/linked-data"
import { LinkedDataContext } from "./LinkedDataContext";

const App = () => {
  const linkedData = useMemo(() => new LinkedData({
    schemas: {
      Task: {
        type: "object",
        properties: {
          subTasks: { type: "array", items: "Task" },
        }
      },

      Person: {
        type: "object",
      }
    }
  }), []);

  return <LinkedDataContext.Provider value={linkedData}>
    <div>
      <h1>Hello world</h1>
    </div>
  </LinkedDataContext.Provider>
}

React.render(<App />, document.getElementById('app')!);
