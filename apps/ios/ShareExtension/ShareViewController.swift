import SwiftUI
import UIKit

/// Share Extension 入口（01 §11）：托管 SwiftUI。收件箱写入与直抓在后续任务卡实现（P7）。
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: ShareView())
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}
