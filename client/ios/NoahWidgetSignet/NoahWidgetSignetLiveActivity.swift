//
//  NoahWidgetSignetLiveActivity.swift
//  NoahWidgetSignet
//
//  Created by Nitesh Chowdhary Balusu on 11/12/25.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct NoahWidgetSignetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct NoahWidgetSignetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NoahWidgetSignetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension NoahWidgetSignetAttributes {
    fileprivate static var preview: NoahWidgetSignetAttributes {
        NoahWidgetSignetAttributes(name: "World")
    }
}

extension NoahWidgetSignetAttributes.ContentState {
    fileprivate static var smiley: NoahWidgetSignetAttributes.ContentState {
        NoahWidgetSignetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: NoahWidgetSignetAttributes.ContentState {
         NoahWidgetSignetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: NoahWidgetSignetAttributes.preview) {
   NoahWidgetSignetLiveActivity()
} contentStates: {
    NoahWidgetSignetAttributes.ContentState.smiley
    NoahWidgetSignetAttributes.ContentState.starEyes
}
