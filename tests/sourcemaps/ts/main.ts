import {Sub} from "./sub/sub";

const name$test = {
    $foo: {
        bar$: {
            b_$_z(this: void, a: string, b: string) { return {__$$: a + b} }
        },
        name$test: "raboof",
        "slash\\": {
            $blah: "bufar"
        }
    }
};

function printFoobar() {
    console.log(this._VERSION);
    const foobar = Sub.foobar();
    console.log(foobar);
    const self = 42;
    console.log(self);
    console.log(name$test);
    const ڂ = "FOO";
    console.log(name$test.$foo.bar$.b_$_z(ڂ, 'BAR').__$$);
    console.log(name$test["$foo"]["bar$"]["b_$_z"](ڂ, 'BAR')["__$$"]);
    console.log(name$test["$foo"].bar$["b_$_z"](ڂ, 'BAR').__$$);
}

printFoobar();
