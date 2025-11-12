//
//  NoahWidgetMainnetLiveActivity.swift
//  NoahWidgetMainnet
//
//  Created by Nitesh Chowdhary Balusu on 11/12/25.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct NoahWidgetMainnetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct NoahWidgetMainnetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NoahWidgetMainnetAttributes.self) { context in
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

extension NoahWidgetMainnetAttributes {
    fileprivate static var preview: NoahWidgetMainnetAttributes {
        NoahWidgetMainnetAttributes(name: "World")
    }
}

extension NoahWidgetMainnetAttributes.ContentState {
    fileprivate static var smiley: NoahWidgetMainnetAttributes.ContentState {
        NoahWidgetMainnetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: NoahWidgetMainnetAttributes.ContentState {
         NoahWidgetMainnetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: NoahWidgetMainnetAttributes.preview) {
   NoahWidgetMainnetLiveActivity()
} contentStates: {
    NoahWidgetMainnetAttributes.ContentState.smiley
    NoahWidgetMainnetAttributes.ContentState.starEyes
}
