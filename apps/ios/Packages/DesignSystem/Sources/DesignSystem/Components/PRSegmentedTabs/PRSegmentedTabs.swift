import SwiftUI

/// 首页「推荐 / 收藏」文字标签（01 §5.2；原型 home-screen：22 / 28 粗体，未选中为次要色 60%）。
public struct PRSegmentedTabs<ID: Hashable>: View {
    public struct Item: Identifiable {
        public let id: ID
        public let title: LocalizedStringKey

        public init(id: ID, title: LocalizedStringKey) {
            self.id = id
            self.title = title
        }
    }

    @Binding private var selection: ID
    private let items: [Item]

    public init(selection: Binding<ID>, items: [Item]) {
        _selection = selection
        self.items = items
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PRSpace.l) {
            ForEach(items) { item in
                let active = item.id == selection
                Button {
                    selection = item.id
                } label: {
                    Text(item.title)
                        .font(PRFont.title)
                        .foregroundStyle(active ? PRColor.textPrimary : PRColor.textSecondary.opacity(0.6))
                        .frame(minHeight: PRSize.minTapTarget)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? [.isSelected, .isHeader] : [])
            }
        }
    }
}

#Preview("PRSegmentedTabs") {
    @Previewable @State var tab = 0
    PRSegmentedTabs(selection: $tab, items: [.init(id: 0, title: "推荐"), .init(id: 1, title: "收藏")])
        .padding()
        .background(PRColor.bgPrimary)
}
